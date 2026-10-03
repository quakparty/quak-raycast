import AVFoundation
import CoreGraphics
import Foundation
import RaycastSwiftMacros

// Each call runs in its own process, so the extension steers a recording through files in `directory`:
// - audio.m4a: the recording (AAC, mono), written here
// - started: created once the microphone records (after a permission prompt, if there was one)
// - heartbeat: touched by the extension every few hundred ms; when it goes stale the command is gone
// - stop: written by the extension, "send" keeps the audio, "cancel" discards it
// While recording it also watches the Raycast window: Raycast keeps a hidden command mounted (until "pop to root"),
// so the heartbeat goes on. Without a visible Raycast window for a second the recording stops and is discarded.
struct Recording: Encodable {
  let path: String
  let seconds: Double
  // "stopped", "limit", "cancelled" or "hidden" (Raycast's window closed, the audio is discarded)
  let reason: String
}

enum RecorderError: Error, CustomStringConvertible {
  case microphoneDenied
  case noMicrophone
  case failed(String)

  // The extension matches the code before the colon
  var description: String {
    switch self {
    case .microphoneDenied: "MICROPHONE_DENIED: Raycast may not use the microphone"
    case .noMicrophone: "NO_MICROPHONE: No microphone found"
    case .failed(let reason): "RECORDING_FAILED: \(reason)"
    }
  }
}

private let heartbeatTimeout: TimeInterval = 3
private let pollInterval: UInt64 = 100_000_000
// How often the window list is read, and how long no Raycast window may be visible
private let windowCheckInterval: TimeInterval = 0.3
private let hiddenTimeout: TimeInterval = 1

@raycast func record(directory: String, maxSeconds: Double) async throws -> Recording {
  let folder = URL(fileURLWithPath: directory, isDirectory: true)
  let audio = folder.appendingPathComponent("audio.m4a")

  switch AVCaptureDevice.authorizationStatus(for: .audio) {
  case .authorized:
    break
  case .notDetermined:
    // The prompt names Raycast, the process responsible for this helper
    guard await AVCaptureDevice.requestAccess(for: .audio) else { throw RecorderError.microphoneDenied }
  default:
    throw RecorderError.microphoneDenied
  }
  guard AVCaptureDevice.default(for: .audio) != nil else { throw RecorderError.noMicrophone }

  // The extension may have given up while the prompt was open; a stop before the start keeps nothing either
  if readStop(folder) != nil || isAbandoned(folder) {
    discard(folder)
    return Recording(path: audio.path, seconds: 0, reason: "cancelled")
  }

  let settings: [String: Any] = [
    AVFormatIDKey: kAudioFormatMPEG4AAC,
    AVSampleRateKey: 48_000,
    AVNumberOfChannelsKey: 1,
    AVEncoderBitRateKey: 64_000,
  ]
  let recorder: AVAudioRecorder
  do {
    recorder = try AVAudioRecorder(url: audio, settings: settings)
  } catch {
    throw RecorderError.failed(error.localizedDescription)
  }
  guard recorder.prepareToRecord(), recorder.record(forDuration: maxSeconds) else {
    throw RecorderError.failed("The microphone did not start")
  }
  let start = Date()
  FileManager.default.createFile(atPath: folder.appendingPathComponent("started").path, contents: nil)

  let raycast = ancestorPIDs()
  var lastWindowCheck = Date.distantPast
  var lastVisible = Date()

  while true {
    try? await Task.sleep(nanoseconds: pollInterval)
    let seconds = min(Date().timeIntervalSince(start), maxSeconds)

    // record(forDuration:) stops by itself at the limit
    if !recorder.isRecording {
      return Recording(path: audio.path, seconds: seconds, reason: "limit")
    }
    let command = readStop(folder) ?? (isAbandoned(folder) ? "cancel" : nil)
    switch command {
    case "send":
      recorder.stop()
      return Recording(path: audio.path, seconds: seconds, reason: "stopped")
    case "cancel":
      recorder.stop()
      discard(folder)
      return Recording(path: audio.path, seconds: seconds, reason: "cancelled")
    default:
      break
    }

    if Date().timeIntervalSince(lastWindowCheck) >= windowCheckInterval {
      lastWindowCheck = Date()
      // nil: the window list could not be read, then only the heartbeat counts
      if raycastWindowVisible(raycast) != false {
        lastVisible = lastWindowCheck
      } else if lastWindowCheck.timeIntervalSince(lastVisible) > hiddenTimeout {
        recorder.stop()
        discard(folder)
        return Recording(path: audio.path, seconds: seconds, reason: "hidden")
      }
    }
  }
}

// Raycast's main window: an on-screen panel above normal windows (layer > 0, measured on macOS 27: layer 8,
// 825×523), owned by the Raycast process this helper runs under. Window names would need the screen recording
// permission, so only owner, layer and bounds are read. The size skips small windows like a menu bar item.
// Returns nil when the window list cannot be read.
private func raycastWindowVisible(_ raycast: Set<pid_t>) -> Bool? {
  guard
    let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
      as? [[String: Any]],
    !windows.isEmpty
  else { return nil }
  return windows.contains { window in
    let owner = (window[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? -1
    let name = window[kCGWindowOwnerName as String] as? String
    guard raycast.contains(owner) || name == "Raycast" else { return false }
    let layer = (window[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
    let alpha = (window[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1
    guard layer > 0, alpha > 0,
      let bounds = window[kCGWindowBounds as String] as? NSDictionary,
      let rect = CGRect(dictionaryRepresentation: bounds)
    else { return false }
    return rect.width >= 300 && rect.height >= 100
  }
}

// This process and its parents up to launchd: Raycast starts the extension's backend, which starts this helper
private func ancestorPIDs() -> Set<pid_t> {
  var pids = Set<pid_t>()
  var pid = getpid()
  while pid > 1, pids.insert(pid).inserted {
    var info = kinfo_proc()
    var size = MemoryLayout<kinfo_proc>.stride
    var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]
    guard sysctl(&mib, u_int(mib.count), &info, &size, nil, 0) == 0, size > 0 else { break }
    pid = info.kp_eproc.e_ppid
  }
  return pids
}

private func readStop(_ folder: URL) -> String? {
  guard let data = FileManager.default.contents(atPath: folder.appendingPathComponent("stop").path) else { return nil }
  return String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
}

// The command unloaded without saying so (Raycast closed, the extension crashed): no heartbeat, or no parent
private func isAbandoned(_ folder: URL) -> Bool {
  if getppid() == 1 { return true }
  let heartbeat = folder.appendingPathComponent("heartbeat").path
  guard let attributes = try? FileManager.default.attributesOfItem(atPath: heartbeat),
    let touched = attributes[.modificationDate] as? Date
  else { return true }
  return Date().timeIntervalSince(touched) > heartbeatTimeout
}

private func discard(_ folder: URL) {
  try? FileManager.default.removeItem(at: folder)
}
