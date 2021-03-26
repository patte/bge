sitemaps.add '/sitemap.xml', ->
  pages = []
  pages.push
    page: '/de'
    #lastmod: new Date()
    changefreq: 'weekly'
  LANGUAGES.forEach (lang) ->
    pages.push
      page: "/#{lang}/smartervote"
      #lastmod: new Date()
      changefreq: 'monthly'
    pages.push
      page: "/#{lang}/smartervote-content"
      #lastmod: new Date()
      changefreq: 'monthly'
    #pages.push
    #  page: "/#{lang}/blog"
    #  #lastmod: new Date()
    #  changefreq: 'weekly'
    Posts.find({published: true}).forEach (page) ->
      pages.push
        page: "/#{lang}/pages/#{page.slug}"
        lastmod: page.updatedAt
      return
  #doesn't work for some unknown reason
  #pages.push
  #  page: 'de'
  #  xhtmlLinks: [
  #    { rel: 'alternate', hreflang: 'fr', href: '/fr' },
  #    { rel: 'alternate', hreflang: 'it', href: '/it' },
  #    { rel: 'alternate', hreflang: 'en', href: '/en' }
  #  ]
  pages
