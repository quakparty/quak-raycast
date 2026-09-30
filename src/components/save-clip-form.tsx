import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { showError } from "../lib/errors";
import { unwrap } from "@quak/js";
import { quak } from "../lib/quak";

// Saves the audio of a play as a clip; without a name the API picks one (first words or kind and date)
export function SaveClipForm({ playId, onSaved }: { playId: string; onSaved?: () => void }) {
  const { pop } = useNavigation();

  async function submit(values: { name: string }) {
    const name = values.name.trim();
    const toast = await showToast({ style: Toast.Style.Animated, title: "Saving clip…" });
    try {
      const { data: clip } = await unwrap(
        quak().api.POST("/v1/plays/{uuid}/save", { params: { path: { uuid: playId } }, body: name ? { name } : {} }),
      );
      toast.style = Toast.Style.Success;
      toast.title = `Saved as “${clip.name}”`;
      onSaved?.();
      pop();
    } catch (error) {
      await toast.hide();
      await showError(error, "Could not save the clip");
    }
  }

  return (
    <Form
      navigationTitle="Save as Clip"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save as Clip" icon={Icon.SaveDocument} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" placeholder="Automatic" autoFocus />
      <Form.Description text="Saves the audio as it played, with intro, outro and effects." />
    </Form>
  );
}
