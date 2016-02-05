# we catch the keydown event of contenteditable in
# the Template.post.events map
Template.postTitle.onRendered ->
  if Roles.userIsInRole Meteor.userId(), 'admin'
    @$('.page-header h1').attr('contenteditable', 'true')


Template.post.onCreated ->
  tmpl = @
  @autorun ->
    data = Template.currentData()
    lang = TAPi18n.getLanguage()
    tmpl.subscribe("crumbsForPost", data._id, lang)

Template.post.onRendered ->
  document.title = @data.title
  $(window).on 'keydown', (evt) ->
    if evt.keyCode is 27 #esc
      cancelCrumbEditing()
  $(window).on "beforeunload", ->
    if !cancelCrumbEditing()
      return "You have unsaved changes in a crumb!"

Template.post.onDestroyed ->
  $(window).off 'keydown'
  $(window).off 'beforeunload'

Template.post.helpers
  post: ->
    @

  crumbs: ->
    Crumbs.find
      postId: @_id
    ,
      sort: { index: 1 }

Template.post.events
  'submit #createCrumb': (evt) ->
    evt.preventDefault()
    if cancelCrumbEditing()
      lang = TAPi18n.getLanguage()
      Meteor.call "createCrumb", @_id, lang, (error, _id)->
        throwError error if error?
        Session.set 'editingCrumbId', _id
    false

  'keydown h1[contenteditable]': (evt) ->
    if evt.keyCode is 13 #return key
      title = evt.target.innerText
      Meteor.call 'changePostTitle', @_id, title, (error, slug) ->
        throwError error if error?
        Router.go 'pages/:slug',
          slug: slug
        ,
          replaceState: true
      return false
    return true
