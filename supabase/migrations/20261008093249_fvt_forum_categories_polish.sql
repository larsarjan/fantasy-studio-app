-- Content-only taxonomy migration. Topic/post identities and RLS are unchanged.
-- The posting trigger requires a signed-in actor. Suspend only that trigger while
-- moving category FKs, under the migration transaction/table lock, then restore it.
alter table public.forum_topics disable trigger prepare_forum_topic;
do $$
declare old_name text; new_name text; old_id uuid; new_id uuid;
begin
 for old_name,new_name in select * from (values
  ('Mijn selectie','Selectie & Transfers'),
  ('Transfers & Wildcards','Selectie & Transfers'),
  ('Speelronde-discussie','Speelrondes & Captainkeuzes'),
  ('Captainkeuze','Speelrondes & Captainkeuzes'),
  (U&'FVT-video\2019s',U&'FVT-video\2019s & content')
 ) as mapping(old_label,new_label) loop
  select id into old_id from public.forum_categories where name=old_name;
  select id into new_id from public.forum_categories where name=new_name;
  if old_id is not null then
   if new_id is null then
    update public.forum_categories set name=new_name where id=old_id;
   else
    update public.forum_topics set category_id=new_id where category_id=old_id;
    delete from public.forum_categories where id=old_id;
   end if;
  end if;
 end loop;
end $$;
alter table public.forum_topics enable trigger prepare_forum_topic;
insert into public.forum_categories(name,description,position) values
 ('Algemeen Fantasy','Spelregels, strategie en alles wat fantasy leuk maakt.',1),
 ('Selectie & Transfers','Teamadvies, transfers, budget en wildcards.',2),
 ('Spelers','Vorm, speelminuten, kansen en jouw volgende ontdekking.',3),
 ('Clubs','Clubnieuws, opstellingen en de blik van supporters.',4),
 ('Speelrondes & Captainkeuzes','Bespreek de ronde, deadlines en de aanvoerdersband.',5),
 (U&'FVT-video\2019s & content','Praat na over afleveringen en deel vragen voor FVT.',6),
 ('Off-topic voetbal','Alles rond voetbal buiten je fantasyselectie.',7)
on conflict(name) do update set description=excluded.description,position=excluded.position;
