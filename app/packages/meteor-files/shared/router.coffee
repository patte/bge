Router.route '/admin/files',
  name: "files"
  waitOn: ->
    [
      Meteor.subscribe('files')
      Meteor.subscribe('adminUsers')
    ]
  action: ->
    @render 'files'
