import CrmNotification from "@/models/crm/Notification";

export async function createNotification(tenantId: string, user_id: string, type: string, title: string, message: string, link?: string) {
  try {
    await CrmNotification.create({
      tenantId,
      user_id,
      type,
      title,
      message,
      link
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}
