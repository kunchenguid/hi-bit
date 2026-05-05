import type { HiBitLayout } from "./storage/layout";
import { verifyParentPin } from "./storage/parentPin";

export async function requireParentPinForProfileCreation(
  layout: HiBitLayout,
  parentPin: string | undefined,
): Promise<void> {
  if (!parentPin || !(await verifyParentPin(layout, parentPin))) {
    throw new Error("Parent PIN is required to create learners");
  }
}
