export function checkErpSyncStatus(integrationLink: any) {
  if (!integrationLink) return { status: "Not Linked" };

  const hoursSinceSync = (Date.now() - new Date(integrationLink.lastSyncAt).getTime()) / 3600000;

  if (integrationLink.syncStatus === "Failed") {
    return { status: "Error", message: integrationLink.errorMessage, retryAttempts: integrationLink.retryAttempts };
  }

  if (hoursSinceSync > 24) {
    return { status: "Warning", message: "Sync delayed > 24h" };
  }

  return { status: "Healthy", lastSync: integrationLink.lastSyncAt };
}
