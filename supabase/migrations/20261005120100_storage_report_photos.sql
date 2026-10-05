-- Private bucket for optional "Report a number" photos (a picture of the in-store menu board).
-- No storage policies are created, so only the server (secret key) can read or write.
-- The app uploads through a short-lived signed upload URL issued by POST /api/v1/reports.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/heic'])
on conflict (id) do nothing;
