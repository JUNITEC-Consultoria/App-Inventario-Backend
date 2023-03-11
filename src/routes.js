const express = require("express");
const routes = express.Router();

const excel = require("./modules/excel.js");

const Users = require("./controllers/usersController.js");
const Items = require("./controllers/itemsController.js");
const Locations = require("./controllers/locationsController.js");
const Sessions = require("./controllers/sessionsController.js");
const { get } = require("./controllers/itemsController.js");

function adminSecurity(req, res, next) {
	if (req.session.isAdmin) return next();
	else return res.sendStatus(403);
}

//session
routes.get("/isLogged", Sessions.isLoged);
routes.get("/isAdmin", Sessions.isAdmin);

routes.post("/login", Sessions.login);
routes.post("/logout", Sessions.logout);

//users
routes.get("/users", Users.fetchUsers);
routes.get("/user/:id", Users.userInfo);
routes.get("/user/:id/items", Users.fetchItems);

routes.put("/user/:id", Users.userUpdate);
routes.put("/user/:id/password", Users.pwchange);
routes.put("/user/:uid/items/:iid", Users.requestItems);

routes.post("/add-user", adminSecurity, Users.add);
routes.post("/users", adminSecurity, excel.fetchWorkbook, Users.importFromExcel);

routes.delete("/user/:id", Users.userDelete);
routes.delete("/user/:uid/items/:iid", Users.releaseItems);

//items
routes.get("/items", Items.get);
routes.get("/item/:id", Items.single);
routes.get("/item/:iid/users/:uid", Items.userList);
routes.get("/items/request/usersList", Users.fetchRequestableUsers);

routes.put("/item/:id", Items.update);

routes.post("/item", Items.new);
routes.post("/items", adminSecurity, excel.fetchWorkbook, Items.importFromExcel);

routes.delete("/item/:id", Items.remove);

//locations
routes.get("/locations", Locations.get);
routes.get("/locations/export", adminSecurity, excel.createWorkbook, Locations.exportAsExcel);

routes.put("/location/:id", adminSecurity, Locations.update);

routes.post("/location", adminSecurity, Locations.new);
routes.post("/locations/import", adminSecurity, excel.fetchWorkbook, Locations.importFromExcel);

routes.delete("/location/:id", adminSecurity, Locations.remove);
routes.delete("/locations", adminSecurity, Locations.removeMultiple);
routes.delete("/locations/all", adminSecurity, Locations.removeAll);

//requests
routes.get("/requests/:iid", Items.getItemRequests);

module.exports = routes;
