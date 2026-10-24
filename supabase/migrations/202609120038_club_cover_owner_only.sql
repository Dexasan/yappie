begin;

-- Club images are written by the validated upload service. Remove the last
-- direct Storage write path so moderators cannot delete a creator's cover.
drop policy if exists club_staff_delete_avatar on storage.objects;

comment on column public.clubs.avatar_path is
  'Public Club cover image. Only the original creator may change it through the validated upload service.';

commit;
