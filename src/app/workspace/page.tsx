import { WorkspaceClient } from "@/components/workspace-client";
import { getActiveModels, getCurrentProfile, getUserImages, getUserTasks } from "@/lib/queries";

export default async function WorkspacePage() {
  const [profile, models, tasks, images] = await Promise.all([
    getCurrentProfile(),
    getActiveModels(),
    getUserTasks(),
    getUserImages()
  ]);

  return <WorkspaceClient profile={profile} models={models} recentTasks={tasks} images={images} isConfigured={true} />;
}
