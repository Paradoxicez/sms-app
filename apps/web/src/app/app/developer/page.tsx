import { redirect } from "next/navigation";

export default function DeveloperRootPage() {
  redirect("/app/developer/docs");
}
