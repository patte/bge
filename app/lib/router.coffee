Router.configure
  layoutTemplate: "layout"
  loadingTemplate: "loading"
  notFoundTemplate: "not_found"
  i18n:
    exclude: [
      '\/admin', '\/blog', '\/img\/', '\/reset-password'
    ]
    server:
      exclude:
        sitemap: '^\/sitemap\.xml'


#if Meteor.isClient
#  AccountsEntry.config
#    homeRoute: '/home' #redirect to this path after sign-out
#    dashboardRoute: '/home'  #redirect to this path after sign-in
#    passwordSignupFields: 'EMAIL_ONLY'

if Meteor.isClient
  Router.onAfterAction ->
    Meteor.Piwik.trackPage(Router.current().route.path(this))


Router.route '/',
  name: 'home'
  waitOn: ->
    [
      Meteor.subscribe('news')
      Meteor.subscribe('newsImages')
    ]
  action: ->
    @render 'home'

#admin routes
Router.route '/admin/users',
  waitOn: ->
    Meteor.subscribe('users')
  action: ->
    @render 'users'

Router.route '/admin/cnc',
  action: ->
    @render 'cnc'

Router.route '/account',
  action: ->
    @render 'account'
