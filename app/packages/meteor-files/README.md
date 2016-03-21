meteor files
------------------
simple file upload and sharing


Usage
-----
- uploading and viewing is only allowed for user in role admin
- publish adminUsers
```
Meteor.publish "adminUsers", ->
  return unless onlyIfAdmin.call(@)
  Meteor.users.find(
    roles: 'admin'
  ,
    fields:
      _id: 1
      emails: 1
      profile: 1
      roles: 1
      status: 1
      createdAt: 1
  )
```


Modify
------
The meteor folder structure has been used in this package and package.js is automatically generated with meteor-package-paths
```
npm install -g meteor-package-paths
```
