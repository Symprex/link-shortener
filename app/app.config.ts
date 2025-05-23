export default defineAppConfig({
  title: 'Symprex Go',
  email: 'help@symprex.com',
  github: 'https://github.com/symprex/link-shortener',
  twitter: 'https://sink.cool/kai',
  telegram: 'https://sink.cool/telegram',
  mastodon: 'https://sink.cool/mastodon',
  blog: 'https://sink.cool/blog',
  description: 'A company-wide link shortener',
  image: 'https://sink.cool/banner.png',
  previewTTL: 300, // 5 minutes
  slugRegex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/i,
  reserveSlug: [
    'dashboard',
  ],
})
