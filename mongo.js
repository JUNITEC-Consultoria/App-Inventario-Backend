const mongoose = require("mongoose");

const { DB_URL } = process.env;

module.exports = mongoose.connect(
	DB_URL,
	// "mongodb+srv://junitec:xtTDeQFV9Rf6ZAD@appinventario.bhznm.mongodb.net/inventario?retryWrites=true&w=majority",
	//"mongodb+srv://brunomcebola:SNas3exLrcJACf7@testcluster.kukbj.mongodb.net/inventario?retryWrites=true&w=majority",
	{ useNewUrlParser: true, useUnifiedTopology: true }
);
