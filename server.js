//ligação à base de dados
require("dotenv").config();
require("./mongo.js");

const express = require("express");
const session = require("express-session");
const cors = require("cors");
const requireDir = require("require-dir");

const mongoose = require("mongoose");
const MongoStore = require("connect-mongo")(session);

const Users = require("./src/models/Users.js");

const { COOKIE_SECRET, ORIGIN } = process.env;

const MAX_AGE = 900 * 1000;
const PORT = process.env.PORT || 3001;

const storeOptions = {
	mongooseConnection: mongoose.connection,
	ttl: MAX_AGE,
};

const app = express();
app.use(express.json());
app.use(
	cors({
		origin: [ORIGIN, "https://inventario-junitec.netlify.app"],
		credentials: true,
	})
);

//session
app.use(
	session({
		store: new MongoStore(storeOptions),
		cookie: {
			maxAge: MAX_AGE,
			httpOnly: false,
			secure: app.get("env") === "production",
			sameSite: false,
		},
		name: "JuninvSession",
		resave: false,
		saveUninitialized: false,
		// monkaS
		secret: COOKIE_SECRET,
	})
);

if (app.get("env") === "production") {
	app.set("trust proxy", 1); // trust first proxy
}

app.use(function (req, res, next) {
	if (!req.session.isInitialized) {
		Object.assign(req.session, {
			userId: null,
			isAdmin: false,
			isInitialized: true,
			forceChange: 0,
		});
	}

	req.session.forceChange++;

	if (req.path.toLowerCase() === "/login") {
		if (req.session.userId !== null) {
			Object.assign(req.session, {
				userId: null,
				isAdmin: false,
				isInitialized: true,
				forceChange: 0,
			});
			return res.redirect(307, "/login");
		}
	} else {
		if (req.session.userId === null) {
			return res.status(401).json({
				ok: false,
				msg: "Utilizador sem sessão iniciada",
			});
		}
	}

	next();
});

app.use(function (req, res, next) {
	if (req.headers.host == "localhost:3001") next();
	else {
		if (!req.headers.referer || req.headers.referer.substring(0, 38) != "https://inventario-junitec.netlify.app")
			return res.sendStatus(401);
		else next();
	}
});

//db models files
requireDir("./src/models");

app.use("", require("./src/routes"));

app.listen(PORT);
