const mongoose = require("mongoose");
//permite separar a informação por páginas
const mongoosePaginate = require("mongoose-paginate");
//library que permite criar os hashes
const crypto = require("crypto");
//library para encriptar sem hash
const aes256 = require("aes256");

/* ESQUEMA DA INFORMAÇÃO REFERENTE AOS UTILIZADORES */
const UsersSchema = new mongoose.Schema({
	isVirtual: { type: Boolean, required: true },

	isAdmin: { type: Boolean, required: true, default: false },

	name: { type: String, required: true },

	project: { type: String },

	email: { type: String },

	emailSalt: { type: String },

	password: { type: String },

	passwordSalt: { type: String },

	image: { type: String },

	imageDeleteHash: { type: String },

	items: [{
		_id: { type: mongoose.ObjectId, required: true },
		quantity: { type: Number, required: true },
	}],
});

UsersSchema.methods.hashPassword = function (password) {
	this.passwordSalt = crypto.randomBytes(16).toString("hex");
	this.password = crypto
		.pbkdf2Sync(password, this.passwordSalt, 1000, 64, `sha512`)
		.toString(`hex`);
};

// UsersSchema.methods.hashEmail = function (email) {
// 	this.emailSalt = crypto.randomBytes(16).toString("hex");
// 	this.email = crypto
// 		.pbkdf2Sync(email, this.emailSalt, 1000, 64, `sha512`)
// 		.toString(`hex`);
// };

UsersSchema.methods.validatePassword = function (password) {
	var hash = crypto
		.pbkdf2Sync(password, this.passwordSalt, 1000, 64, `sha512`)
		.toString(`hex`);

	return this.password === hash;
};

// UsersSchema.methods.validateEmail = function (email) {
// 	var hash = crypto
// 		.pbkdf2Sync(email, this.emailSalt, 1000, 64, `sha512`)
// 		.toString(`hex`);
// 	return this.email === hash;
// };

// ver se estes dois sao precisos
UsersSchema.methods.encryptData = function (data, sel) {
	this[sel] = aes256.encrypt("(Ea7f(3g#$YWmzc_", data);
};

UsersSchema.methods.decryptData = function (sel) {
	return aes256.decrypt("(Ea7f(3g#$YWmzc_", this[sel]);
};

UsersSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("User", UsersSchema);
