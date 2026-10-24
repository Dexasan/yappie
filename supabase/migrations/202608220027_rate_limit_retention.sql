begin;

alter table private.rate_limit_events
  add constraint rate_limit_events_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

commit;
