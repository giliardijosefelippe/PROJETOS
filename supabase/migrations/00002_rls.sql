-- RLS policies — isolation by organization membership
-- Roles: admin/coordenador write broadly; desenhista/conferente write domain; consulta read-only

alter table public.organizations enable row level security;
alter table public.users_profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.projects enable row level security;
alter table public.structures enable row level security;
alter table public.drawing_types enable row level security;
alter table public.drawings enable row level security;
alter table public.drawing_revisions enable row level security;
alter table public.drawing_files enable row level security;
alter table public.standard_sheets enable row level security;
alter table public.standard_parameters enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_template_versions enable row level security;
alter table public.checklist_sections enable row level security;
alter table public.checklist_items enable row level security;
alter table public.checklist_item_media enable row level security;
alter table public.checklist_runs enable row level security;
alter table public.checklist_run_items enable row level security;
alter table public.checklist_item_responses enable row level security;
alter table public.response_evidence enable row level security;
alter table public.issues enable row level security;
alter table public.issue_events enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_events enable row level security;
alter table public.report_exports enable row level security;

-- Profiles: user sees own; members of same org can read colleague profiles
drop policy if exists profiles_select_own_or_org on public.users_profiles;
create policy profiles_select_own_or_org on public.users_profiles
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organization_memberships m1
      join public.organization_memberships m2
        on m1.organization_id = m2.organization_id
      where m1.user_id = auth.uid() and m1.status = 'active'
        and m2.user_id = users_profiles.user_id and m2.status = 'active'
    )
  );

drop policy if exists profiles_update_own on public.users_profiles;
create policy profiles_update_own on public.users_profiles
  for update using (user_id = auth.uid());

drop policy if exists profiles_insert_own on public.users_profiles;
create policy profiles_insert_own on public.users_profiles
  for insert with check (user_id = auth.uid());

-- Organizations: members can read
drop policy if exists orgs_select_member on public.organizations;
create policy orgs_select_member on public.organizations
  for select using (public.is_org_member(id));

drop policy if exists orgs_update_admin on public.organizations;
create policy orgs_update_admin on public.organizations
  for update using (public.has_org_role(id, array['admin']::membership_role[]));

-- Memberships
drop policy if exists memberships_select_org on public.organization_memberships;
create policy memberships_select_org on public.organization_memberships
  for select using (public.is_org_member(organization_id) or user_id = auth.uid());

drop policy if exists memberships_admin_write on public.organization_memberships;
create policy memberships_admin_write on public.organization_memberships
  for all using (public.has_org_role(organization_id, array['admin']::membership_role[]))
  with check (public.has_org_role(organization_id, array['admin']::membership_role[]));

-- Generic org-scoped helpers via macros (repeat pattern)

-- Projects
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (public.is_org_member(organization_id));

drop policy if exists projects_write on public.projects;
create policy projects_write on public.projects
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  );

-- Structures
drop policy if exists structures_select on public.structures;
create policy structures_select on public.structures
  for select using (public.is_org_member(organization_id));

drop policy if exists structures_write on public.structures;
create policy structures_write on public.structures
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  );

-- Drawing types
drop policy if exists drawing_types_select on public.drawing_types;
create policy drawing_types_select on public.drawing_types
  for select using (public.is_org_member(organization_id));

drop policy if exists drawing_types_write on public.drawing_types;
create policy drawing_types_write on public.drawing_types
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  );

-- Drawings
drop policy if exists drawings_select on public.drawings;
create policy drawings_select on public.drawings
  for select using (public.is_org_member(organization_id));

drop policy if exists drawings_write on public.drawings;
create policy drawings_write on public.drawings
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista']::membership_role[])
  );

-- Revisions
drop policy if exists revisions_select on public.drawing_revisions;
create policy revisions_select on public.drawing_revisions
  for select using (public.is_org_member(organization_id));

drop policy if exists revisions_insert on public.drawing_revisions;
create policy revisions_insert on public.drawing_revisions
  for insert with check (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista']::membership_role[])
  );

drop policy if exists revisions_update on public.drawing_revisions;
create policy revisions_update on public.drawing_revisions
  for update using (
    public.is_org_member(organization_id)
    and not immutable
    and public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  );

-- Drawing files
drop policy if exists drawing_files_select on public.drawing_files;
create policy drawing_files_select on public.drawing_files
  for select using (public.is_org_member(organization_id));

drop policy if exists drawing_files_write on public.drawing_files;
create policy drawing_files_write on public.drawing_files
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  );

-- Standard sheets / parameters
drop policy if exists standard_sheets_select on public.standard_sheets;
create policy standard_sheets_select on public.standard_sheets
  for select using (public.is_org_member(organization_id));

drop policy if exists standard_sheets_write on public.standard_sheets;
create policy standard_sheets_write on public.standard_sheets
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  );

drop policy if exists standard_parameters_select on public.standard_parameters;
create policy standard_parameters_select on public.standard_parameters
  for select using (public.is_org_member(organization_id));

drop policy if exists standard_parameters_write on public.standard_parameters;
create policy standard_parameters_write on public.standard_parameters
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  );

-- Templates
drop policy if exists templates_select on public.checklist_templates;
create policy templates_select on public.checklist_templates
  for select using (public.is_org_member(organization_id));

drop policy if exists templates_write on public.checklist_templates;
create policy templates_write on public.checklist_templates
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  );

drop policy if exists template_versions_select on public.checklist_template_versions;
create policy template_versions_select on public.checklist_template_versions
  for select using (public.is_org_member(organization_id));

drop policy if exists template_versions_write on public.checklist_template_versions;
create policy template_versions_write on public.checklist_template_versions
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  );

-- Sections / items / media: access via parent version org
drop policy if exists sections_select on public.checklist_sections;
create policy sections_select on public.checklist_sections
  for select using (
    exists (
      select 1 from public.checklist_template_versions v
      where v.id = template_version_id and public.is_org_member(v.organization_id)
    )
  );

drop policy if exists sections_write on public.checklist_sections;
create policy sections_write on public.checklist_sections
  for all using (
    exists (
      select 1 from public.checklist_template_versions v
      where v.id = template_version_id
        and v.status = 'draft'
        and public.has_org_role(v.organization_id, array['admin','coordenador']::membership_role[])
    )
  ) with check (
    exists (
      select 1 from public.checklist_template_versions v
      where v.id = template_version_id
        and v.status = 'draft'
        and public.has_org_role(v.organization_id, array['admin','coordenador']::membership_role[])
    )
  );

drop policy if exists items_select on public.checklist_items;
create policy items_select on public.checklist_items
  for select using (
    exists (
      select 1 from public.checklist_template_versions v
      where v.id = template_version_id and public.is_org_member(v.organization_id)
    )
  );

drop policy if exists items_write on public.checklist_items;
create policy items_write on public.checklist_items
  for all using (
    exists (
      select 1 from public.checklist_template_versions v
      where v.id = template_version_id
        and v.status = 'draft'
        and public.has_org_role(v.organization_id, array['admin','coordenador']::membership_role[])
    )
  ) with check (
    exists (
      select 1 from public.checklist_template_versions v
      where v.id = template_version_id
        and v.status = 'draft'
        and public.has_org_role(v.organization_id, array['admin','coordenador']::membership_role[])
    )
  );

drop policy if exists item_media_select on public.checklist_item_media;
create policy item_media_select on public.checklist_item_media
  for select using (
    exists (
      select 1 from public.checklist_items i
      join public.checklist_template_versions v on v.id = i.template_version_id
      where i.id = item_id and public.is_org_member(v.organization_id)
    )
  );

drop policy if exists item_media_write on public.checklist_item_media;
create policy item_media_write on public.checklist_item_media
  for all using (
    exists (
      select 1 from public.checklist_items i
      join public.checklist_template_versions v on v.id = i.template_version_id
      where i.id = item_id
        and v.status = 'draft'
        and public.has_org_role(v.organization_id, array['admin','coordenador']::membership_role[])
    )
  ) with check (
    exists (
      select 1 from public.checklist_items i
      join public.checklist_template_versions v on v.id = i.template_version_id
      where i.id = item_id
        and v.status = 'draft'
        and public.has_org_role(v.organization_id, array['admin','coordenador']::membership_role[])
    )
  );

-- Runs / responses / evidence
drop policy if exists runs_select on public.checklist_runs;
create policy runs_select on public.checklist_runs
  for select using (public.is_org_member(organization_id));

drop policy if exists runs_write on public.checklist_runs;
create policy runs_write on public.checklist_runs
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  );

drop policy if exists run_items_select on public.checklist_run_items;
create policy run_items_select on public.checklist_run_items
  for select using (
    exists (
      select 1 from public.checklist_runs r
      where r.id = run_id and public.is_org_member(r.organization_id)
    )
  );

drop policy if exists run_items_write on public.checklist_run_items;
create policy run_items_write on public.checklist_run_items
  for all using (
    exists (
      select 1 from public.checklist_runs r
      where r.id = run_id
        and public.has_org_role(r.organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
    )
  ) with check (
    exists (
      select 1 from public.checklist_runs r
      where r.id = run_id
        and public.has_org_role(r.organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
    )
  );

drop policy if exists responses_select on public.checklist_item_responses;
create policy responses_select on public.checklist_item_responses
  for select using (public.is_org_member(organization_id));

drop policy if exists responses_write on public.checklist_item_responses;
create policy responses_write on public.checklist_item_responses
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  );

drop policy if exists evidence_select on public.response_evidence;
create policy evidence_select on public.response_evidence
  for select using (public.is_org_member(organization_id));

drop policy if exists evidence_write on public.response_evidence;
create policy evidence_write on public.response_evidence
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  );

-- Issues
drop policy if exists issues_select on public.issues;
create policy issues_select on public.issues
  for select using (public.is_org_member(organization_id));

drop policy if exists issues_write on public.issues;
create policy issues_write on public.issues
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  );

drop policy if exists issue_events_select on public.issue_events;
create policy issue_events_select on public.issue_events
  for select using (
    exists (
      select 1 from public.issues i
      where i.id = issue_id and public.is_org_member(i.organization_id)
    )
  );

drop policy if exists issue_events_insert on public.issue_events;
create policy issue_events_insert on public.issue_events
  for insert with check (
    exists (
      select 1 from public.issues i
      where i.id = issue_id
        and public.has_org_role(i.organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
    )
  );

-- Approvals: conferente/admin/coordenador; no delete
drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals
  for select using (public.is_org_member(organization_id));

drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals
  for insert with check (
    public.has_org_role(organization_id, array['admin','coordenador','conferente']::membership_role[])
  );

-- Audit: insert for members, select for admin/coordenador
drop policy if exists audit_select on public.audit_events;
create policy audit_select on public.audit_events
  for select using (
    organization_id is not null
    and public.has_org_role(organization_id, array['admin','coordenador']::membership_role[])
  );

drop policy if exists audit_insert on public.audit_events;
create policy audit_insert on public.audit_events
  for insert with check (
    organization_id is null
    or public.is_org_member(organization_id)
  );

-- Reports
drop policy if exists reports_select on public.report_exports;
create policy reports_select on public.report_exports
  for select using (public.is_org_member(organization_id));

drop policy if exists reports_insert on public.report_exports;
create policy reports_insert on public.report_exports
  for insert with check (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente','consulta']::membership_role[])
  );
