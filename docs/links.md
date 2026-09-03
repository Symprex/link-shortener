# Link file format

Short links are defined in git, one file per link, at `links/<slug>.json`. This
directory is the single source of truth: it is compiled into the Worker
bundle at deploy time, so there is no runtime read of any database or KV
namespace, and a deploy is always exactly what is in the merged commit.

## Adding a link

1. Pick a slug — the short path after `go.symprex.com/`. It must match
   `^[a-z0-9]+(?:-[a-z0-9]+)*$` (lowercase letters, numbers, and single
   hyphens between segments) and must not be `admin`, which is reserved for
   the statistics dashboard.
2. Create `links/<slug>.json` with the fields below.
3. Open a pull request. Once it is merged and deployed, the link is live.

There is no UI for this — every link is added, changed, or removed by editing
a JSON file in a pull request, which keeps the history auditable and
reviewable.

## Fields

Every file has exactly these fields, no others:

| Field     | Type         | Required | Description |
| --------- | ------------ | -------- | ----------- |
| `url`     | string (URL) | yes      | The destination the slug redirects to. |
| `slug`    | string       | yes      | The short path. Must equal the file's basename (`links/careers.json` has `"slug": "careers"`) and must match the slug regex above. |
| `comment` | string       | no       | Free-text note for maintainers — what the link is for, who owns it. Not shown to visitors. |

No `title`, `description`, `image`, or `expiration` field is supported. All
links are permanent once created; there is no expiry mechanism.

Any other field is a validation error, not an ignored extra — including `id`,
`createdAt` and `updatedAt`, which the Sink fork's schema carried and this one
does not. A file copied from an old branch, or exported from the live KV
namespace, therefore fails CI rather than silently reintroducing them.

## The slug is the link's identity

There is no separate identifier. The filename is the slug, the slug is the
identity, and analytics indexes by slug too, so there is exactly one name for
a link everywhere in the system.

The consequence worth knowing: **renaming a slug is a delete plus a create.**
Nothing joins the old name to the new one — the clicks recorded against
`careers` do not follow a rename to `jobs`, and the statistics page will show
them as two separate links. Git is the record of the rename itself; `git log
--follow links/jobs.json` traces the file through it.

Creation and modification times are not fields either. Git already holds both,
more accurately than a hand-maintained timestamp did: nothing could enforce
that an `updatedAt` was bumped when the `url` beside it changed.

```powershell
# When was this link added, and what has changed since?
git log --follow --format='%ad %an %s' --date=short -- links/careers.json
```

## Example

```json
{
  "url": "https://www.symprex.com/careers",
  "slug": "careers",
  "comment": "Symprex careers page"
}
```
