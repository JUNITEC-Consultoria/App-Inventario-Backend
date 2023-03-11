const mongoose = require("mongoose");
//permite separar a informação por páginas
const mongoosePaginate = require("mongoose-paginate");

/* ESQUEMA DA INFORMAÇÃO REFERENTE AOS UTILIZADORES */
const RequestsSchema = new mongoose.Schema({
	userId: { type: mongoose.ObjectId, required: true },

	name: { type: String, required: true },

	project: { type: String, required: true },

	itemId: { type: mongoose.ObjectId, required: true },

	item: { type: String, required: true },

	quantity: { type: Number, required: true },

	date: { type: Date, required: true },
});

// ver se estes dois sao precisos
RequestsSchema.methods.encryptData = function (data, sel) {
	this[sel] = aes256.encrypt("(Ea7f(3g#$YWmzc_", data);
};

RequestsSchema.methods.decryptData = function (sel) {
	return aes256.decrypt("(Ea7f(3g#$YWmzc_", this[sel]);
};

RequestsSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Request", RequestsSchema);

// items -> todos as pessoas que requisitaram
// requests -> todas as pessoas que ainda tem os items a nao null
