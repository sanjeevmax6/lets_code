import Workspace from './workspace';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
async function PrivateWorkspace() {
  await requireChatGPTUser('/');
  return <Workspace />;
}
export default function Home() {
  return <PrivateWorkspace />;
}
