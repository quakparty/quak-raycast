import { open, openExtensionPreferences, showToast, Toast } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { QuakError } from "@quak/js";

// Where people make an API key (Raycast cannot show links on its preferences screen)
export const KEYS_URL = "https://quak.party/app/settings/keys";

// The key in the preferences does not look like a Quak key
export class KeyFormatError extends Error {
  constructor() {
    super("This is not a Quak API key. Paste the whole key, it begins with qk_key_.");
  }
}

// The API's message in a failure toast; a missing, malformed or wrong key also links to the key page and the preferences
export async function showError(error: unknown, title: string) {
  const keyFormat = error instanceof KeyFormatError;
  // 401: the key is wrong or revoked; 403 only for a too low scope (a missing plan feature is a plain error)
  const keyRejected =
    error instanceof QuakError &&
    (error.status === 401 || (error.status === 403 && error.code === "ERROR_INSUFFICIENT_SCOPE"));
  if (keyFormat || keyRejected) {
    await showToast({
      style: Toast.Style.Failure,
      title: keyFormat || error.status === 401 ? "Invalid API key" : title,
      message: error.message,
      primaryAction: { title: "Get API Key", onAction: () => open(KEYS_URL) },
      secondaryAction: { title: "Open Extension Preferences", onAction: () => openExtensionPreferences() },
    });
    return;
  }
  await showFailureToast(error, { title });
}
