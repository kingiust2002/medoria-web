// app/login/page.jsx — neutral admin entry point: choose the Health or Beauty
// operator panel. Lives outside both vertical trees (like /operator and
// /beauty/operator) so middleware never locale-rewrites or vertical-scopes
// it. Not indexed — this is an internal door, not a public page.
import LoginChooser from "./LoginChooser";

export const metadata = {
  title: "Medoria — Admin",
  robots: { index: false, follow: false },
};

export default function AdminEntryPage() {
  return <LoginChooser />;
}
