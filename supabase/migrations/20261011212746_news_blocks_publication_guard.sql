-- Blocks are validated by validate_news_content_blocks. A preserved, short legacy
-- draft must not prevent publication once the new structured article is complete.
alter table public.news_articles drop constraint news_articles_publication_check;
alter table public.news_articles add constraint news_articles_publication_check check (
 status not in ('published','scheduled') or (
  published_at is not null and length(btrim(intro))>=10
  and (content_blocks is not null or length(btrim(body))>=20)
 )
);
