Meteor.publish "files", ->
  if @userId? and Roles.userIsInRole @userId, 'admin'
    Files.find()
  else
    @ready()
    return 
