import { redirect } from "@remix-run/node";

/** Legacy `/` showed Login; keep a stable entry and send users to `/login`. */
export const loader = () => redirect("/login");

export default function Index() {
  return null;
}
