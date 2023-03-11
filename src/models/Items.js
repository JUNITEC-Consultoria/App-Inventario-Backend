const mongoose = require("mongoose");
//permite separar a informação por páginas
const mongoosePaginate = require("mongoose-paginate");
//library para encriptar sem hash
const aes256 = require("aes256");

/* ESQUEMA DA INFORMAÇÃO REFERENTE AOS ITENS */
//Nota countable é String na base de dados mas Boolean no frontend
const ItemsSchema = new mongoose.Schema({
	name: { type: String, required: true },

	totalStock: { type: String, required: true },

	availableStock: { type: String, required: true },

	locationId: { type: mongoose.ObjectId, required: true },

	image: { type: String },

	imageDeleteHash: { type: String },

	description: { type: String },

	link: { type: String },

	linkTitle: { type: String },

	countable: { type: String, required: true },

	requests: [
		{
			_id: { type: mongoose.ObjectId, required: true },
		},
	],
});

ItemsSchema.methods.encryptData = function (data, sel) {
	this[sel] = aes256.encrypt("(Ea7f(3g#$YWmzc_", data);
};

ItemsSchema.methods.decryptData = function (sel) {
	return aes256.decrypt("(Ea7f(3g#$YWmzc_", this[sel]);
};

ItemsSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Item", ItemsSchema);
