// app/beauty/operator/(panel)/users/page.jsx — the people of the panel: who may sign in, to which house, with which role (users.view / users.manage).
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { getPanel } from "@/lib/panel/server";
import { PageHeader } from "@/components/operator/ui";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { listPeople } from "@/lib/operator/userActionsCore";
import { mayGlobal } from "@/lib/operator/access";
import UsersManager from "@/components/operator/UsersManager";
import { createPerson, updatePerson, resetPersonPassword, endPersonSessions } from "@/lib/beauty/operator/userActions";

export const dynamic = "force-dynamic";

export default async function BeautyUsersPage() {
  const { t } = await getPanel();
  const session = await requireBeautySession("users.view");
  const people = await listPeople({ admin: getAdminClient(), session });
  const actor = session.user;
  return (
    <>
      <PageHeader title={t("کاربران")} subtitle={t("چه کسی می‌تواند وارد شود، به کدام بخش و با چه نقشی")} />
      <UsersManager
        users={people.ok ? people.users : []}
        loadError={people.ok ? "" : people.error}
        canManage={mayGlobal(session, "beauty", "users.manage")}
        actor={{ id: actor.id, role: actor.role, houses: actor.houses }}
        panel="beauty"
        actions={{ createPerson, updatePerson, resetPersonPassword, endPersonSessions }}
      />
    </>
  );
}
