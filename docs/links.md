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

| Field       | Type                | Required | Description |
| ----------- | ------------------- | -------- | ----------- |
| `id`        | string               | yes      | Stable identifier for the link, unrelated to the slug. Generated once (nanoid, 10 characters from the alphabet `23456789abcdefghjkmnpqrstuvwxyz`) and never changed, even if the slug is renamed. |
| `url`       | string (URL)         | yes      | The destination the slug redirects to. |
| `slug`      | string               | yes      | The short path. Must equal the file's basename (`links/careers.json` has `"slug": "careers"`) and must match the slug regex above. |
| `comment`   | string               | no       | Free-text note for maintainers — what the link is for, who owns it. Not shown to visitors. |
| `createdAt` | number (unix seconds) | yes     | When the link was first created. |
| `updatedAt` | number (unix seconds) | yes     | When the link was last changed. Update this whenever `url`, `slug`, or `comment` changes. |

No `title`, `description`, `image`, or `expiration` field is supported. All
links are permanent once created; there is no expiry mechanism.

## Example

```json
{
  "id": "kfde65bxsc",
  "url": "https://www.symprex.com/careers",
  "slug": "careers",
  "comment": "Symprex careers page",
  "createdAt": 1735689600,
  "updatedAt": 1735689600
}
```
