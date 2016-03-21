Router.route '/admin/files',
  name: "files"
  waitOn: ->
    [
      Meteor.subscribe('files')
      Meteor.subscribe('users')
    ]
  action: ->
    @render 'files'
