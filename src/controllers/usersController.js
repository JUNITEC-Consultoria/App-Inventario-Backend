//!rever esta trampa toda

const mongoose = require("mongoose");
const excel = require("../modules/excel.js");
const Promise = require("bluebird");

mongoose.set("useFindAndModify", false);

const Users = require("../models/Users");
const Items = require("../models/Items");

const Requests = require("../models/Requests");

// BEGIN AUX

function isValidName(input) {
	return typeof input === "string" && input.length > 0 && input.length <= 64;
}

function isValidProject(input) {
	return typeof input === "string" && input.length > 0 && input.length <= 64;
}

function isValidEmail(input) {
	return (
		typeof input === "string" &&
		input &&
		input.length <= 64 &&
		/^(([^<>()[\].,;:\s@"]+(\.[^<>()[\].,;:\s@"]+)*)|(".+"))@junitec\.pt$/i.test(input)
	); //chromium regex
}

function isValidPassword(input) {
	return typeof input === "string" && input.length >= 8 && input.length <= 30;
}

async function fetchProjects() {
	try {
		return (await Users.find({ project: { $ne: null } }, { project: 1, _id: 0 })).map((user) => user.decryptData("project"));
	} catch (e) {
		return [];
	}
}

// END AUX

async function requestItems(req, res) {
	const { uid, iid } = req.params;

	if (!req.params.uid || !/^[0-9a-f]+/gi.test(req.params.uid)) return res.sendStatus(400);
	else if (!req.params.iid || !/^[0-9a-f]+/gi.test(req.params.iid)) return res.sendStatus(400);

	let quantity = Number(req.body.quantity);

	if (isNaN(quantity) || !Number.isInteger(parseFloat(quantity))) {
		return res.status(400).json({
			ok: false,
			msg: "Invalid quantity request",
		});
	}

	try {
		const user = await Users.findById(uid);
		// ve se user existe
		if (!user) {
			return res.status(404).json({
				ok: false,
				msg: "User not found",
			});
		}

		const item = await Items.findById(iid);
		// ve se item existe
		if (!item) {
			return res.status(404).json({
				ok: false,
				msg: "Item does not exist",
			});
		}

		// desencriptar tudo
		const availableStock = Number(item.availableStock);
		user.items = user.items ?? [];

		// ve se o user tem o item -> pode ser resolvido por uma query
		// aka se retorna um ponteiro para o valor
		const userItem = user.items.find((item) => item._id == iid);

		if (quantity > 0) {
			if (quantity <= availableStock) {
				item.availableStock = availableStock - quantity;

				// se nao existir
				if (!userItem) {
					user.items.push({ _id: req.params.iid, quantity });
				} else {
					// se existir
					userItem.quantity += quantity;
				}
			} else {
				return res.sendStatus(400);
			}
		} else {
			if (userItem && userItem.quantity + quantity >= 0) {
				item.availableStock = availableStock - quantity;
				// se nao existir
				userItem.quantity += quantity;

				if (userItem.quantity === 0) {
					user.items = user.items.filter((item) => item !== userItem);

					console.log(userItem);
					console.log(user.items);
				}
			} else {
				return res.sendStatus(400);
			}
		}

		await user.save();
		// request in the db

		const request = new Requests({
			userId: uid,
			name: user.name,
			project: user.project ?? "-",
			itemId: iid,
			item: item.name,
			quantity,
			date: new Date().toISOString(),
		});

		await request.save();

		// and add it to the items list
		item.requests = item.requests ?? [];
		item.requests.push({ _id: request._id });

		// saves the new item
		try {
			const afterItem = await item.save();

			return res.status(200).send(afterItem.availableStock);
		} catch (err) {
			// se nao conseguir dar save
			if (!userItem) {
				user.items.pop();
			} else {
				// caso tenha sido removido
				if (userItem.quantity === 0) {
					user.items.push(userItem);
				}

				userItem.quantity -= quantity;
			}

			await user.save();

			return res.status(400);
		}
	} catch (err) {
		console.log(err);
		return res.sendStatus(500);
	}
}

async function fetchItems(req, res) {
	try {
		if (!req.params.id || !/^[0-9a-f]+/gi.test(req.params.id)) {
			return res.status(400).json({
				ok: false,
				msg: "ID inválido!",
			});
		}

		let user = await Users.findById(req.params.id);

		if (!user) {
			return res.status(400).json({
				ok: false,
				msg: "Utilizador não encontrado",
			});
		}

		const items = await Promise.all(
			(user.items ?? []).map(async (item) => {
				let itemModel = await Items.findById({ _id: item._id });
				return {
					_id: item._id,
					quantity: item.quantity,
					name: itemModel.name,
					totalStock: itemModel.totalStock,
					availableStock: itemModel.availableStock,
					locationId: itemModel.locationId,
					image: itemModel.image ? itemModel.image : null,
				};
			})
		);

		res.status(200).json({
			ok: true,
			items: items,
		});
	} catch (exc) {
		console.log(exc);
		return res.status(500).json({ ok: false });
	}
}

function releaseItems(req, res) {
	try {
		if (req.params.uid != req.session.userId && !req.session.isAdmin) return res.sendStatus(403);
		else if (!req.params.uid || !/^[0-9a-f]+/gi.test(req.params.uid)) return res.sendStatus(400);
		else if (!req.params.iid || !/^[0-9a-f]+/gi.test(req.params.iid)) return res.sendStatus(400);
		else {
			Users.findOne({ _id: req.params.uid }, (err, user) => {
				if (err) res.sendStatus(500);
				else if (!user) res.sendStatus(404);
				else {
					user.items = user.items ?? [];
					var itemIndex = user.items.findIndex((item) => item._id == req.params.iid);
					var userQnt = 0;

					if (itemIndex == -1) res.sendStatus(404);
					else {
						userQnt = user.items[itemIndex].quantity;
						user.items.splice(itemIndex, 1);

						user.save((err, afterUser) => {
							if (err) res.sendStatus(500);
							else {
								Items.findOne({ _id: req.params.iid }, (err, item) => {
									if (err) res.sendStatus(500);
									else if (!item) res.sendStatus(404);
									else {
										item.encryptData(Number(item.decryptData("availableStock")) + userQnt + "", "availableStock");

										item.save((err) => {
											if (err) {
												afterUser.items.push({
													_id: req.params.iid,
													quantity: userQnt,
												});
												afterUser.save(() => res.sendStatus(500));
											} else {
												var itemId = req.params.iid;
												var userId = req.params.uid;
												History.changeDate(itemId, userId).then((msg) => {
													res.status(200).send(msg);
												});
												res.sendStatus(200);
											}
										});
									}
								});
							}
						});
					}
				}
			});
		}
	} catch {
		return res.sendStatus(500);
	}
}

async function fetchUsers(req, res) {
	try {
		let users = (await Users.find()).map((user) => ({
			id: user._id,
			name: user.name,
			project: user.project,
			image: user.image ? user.decryptData("image") : null,
			self: user._id == req.session.userId,
			items: user.items ?? [],
			isVirtual: user.isVirtual,
			isAdmin: user.isAdmin,
		}));

		const projects = await fetchProjects();

		return res.status(200).json({
			ok: true,
			list: users,
			projects,
		});
	} catch (err) {
		console.log(err);

		return res.status(500).json({
			ok: false,
		});
	}
}

async function fetchRequestableUsers(req, res) {
	try {
		const { isVirtual, isAdmin, userId } = req.session;

		// mudar isto probs para dar para os membros do TecStorm verem tambem
		// check uma beca burro mas legacy i guess
		if (isVirtual) {
			return res.status(403).json({
				ok: false,
				msg: "Apenas membros da Junitec podem aceder aos itens",
			});
		}

		let query;
		// se for admin pede todos exceto eu
		if (!isAdmin) {
			query = { $or: [{ _id: userId }, { isVirtual: true }] };
			// query = {}
		}
		// se for juniuser pede so os virtuais
		else {
			query = {};
		}

		// checkar como e que consigo dar sort dos users antes da data encriptada
		const users = (await Users.find(query).sort({ name: 1, project: 1 })).map((user) => ({
			id: user._id,
			name: user.name,
			project: user.project,
			image: user.image ? user.decryptData("image") : null,
			self: user._id === req.session.userId,
			items: user.items ?? [],
			isVirtual: user.isVirtual,
		}));

		return res.status(200).json({
			ok: true,
			list: users,
		});
	} catch (err) {
		return res.status(500).json({
			ok: false,
			internal: err.toString(),
		});
	}
}

async function add(req, res) {
	const { name, email, password, admin, project, image, imageDeleteHash } = req.body;
	const { isAdmin } = req.session;

	if (!isAdmin) {
		return res.status(403).json({
			ok: false,
			msg: "Não está autorizado a executar esta ação",
		});
	}

	if (!isValidName(name)) {
		return res.status(400).json({
			ok: false,
			msg: "Nome inválido",
		});
	}

	let isVirtual = !isValidEmail(email);
	let user = await Users.findOne({
		$or: [
			{ email, isVirtual: false },
			{ name, project, isVirtual: true },
		],
	});

	if (user) {
		if (isVirtual) {
			return res.status(400).json({
				ok: false,
				msg: "Utilizadores virtuais necessitam de nomes únicos!",
			});
		}

		return res.status(400).json({
			ok: false,
			msg: "Já existe um utilizador com este endereço de email!",
		});
	}

	// caso nada exista
	const newUser = new Users();

	if (!isVirtual) {
		let pwd = "junitec123";

		if (isValidPassword(password)) {
			pwd = password;
		} else if (password) {
			return res.status(400).json({
				ok: false,
				msg: "Palavra-passe especificada mas inválida",
			});
		}

		// fuck hashing nos emails nossa senhora dos ceus
		// newUser.hashEmail(req.body.email);
		newUser.email = email;
		newUser.hashPassword(pwd);

		newUser.isAdmin = admin || false;
	}

	// why actually why
	// newUser.encryptData(name, "name");
	newUser.name = name;
	newUser.isVirtual = isVirtual;

	if (isValidProject(project)) {
		newUser.project = req.body.project;
	}

	if (imageDeleteHash) {
		newUser.encryptData(image, "image");
		newUser.encryptData(imageDeleteHash, "imageDeleteHash");
	}

	try {
		const user = await newUser.save();
		return res.status(200).json({ ok: true, msg: "Success", _id: user._id });
	} catch (err) {
		return res.status(500).json({ ok: false });
	}
}

// checkar quando e que posso fazer uma mudanca de pass
async function pwchange(req, res) {
	const { passwords } = req.body;
	const { isAdmin } = req.session;

	if (!isAdmin && req.params.id != userId) {
		return res.status(403).json({
			ok: false,
			msg: "Não está autorizado a executar esta ação",
		});
	}

	if (!passwords || !passwords.old || !isValidPassword(passwords.new)) {
		return res.status(400).json({
			ok: false,
			msg: "Palavra-passe nova inválida!",
		});
	}

	let user = await Users.find({ _id: req.params.id });

	let me;
	if (req.params.id == req.session.userId) {
		me = user;
	} else {
		me = await Users.find({ _id: req.session.userId });
	}

	if (user.length == 0 || me.length == 0) {
		return res.sendStatus(404);
	}

	user = user[0];
	me = me[0];

	if (me.validatePassword(req.body.passwords.old)) {
		user.hashPassword(req.body.passwords.new);

		Users.findOneAndUpdate({ _id: req.params.id }, user, (err) => {
			if (err) res.sendStatus(500);
			else res.sendStatus(200);
		});
	} else {
		res.sendStatus(403);
	}
}

async function userUpdate(req, res) {
	const { name } = req.body;

	if (name && !isValidName(name)) {
		return res.status(400).json({
			ok: false,
			msg: "Nome inválido",
		});
	}

	await Users.findById(req.params.id, async (err, user) => {
		if (err) res.sendStatus(500);
		else if (!user) res.sendStatus(404);
		// isto funciona sequer?
		else {
			for (let key in req.body) {
				if (req.body[key]) {
					user.encryptData(req.body[key] + "", key);
				} else user[key] = "";
			}

			user.save((err) => {
				if (err) res.sendStatus(500);
				else res.sendStatus(200);
			});
		}
	});
}

async function userDelete(req, res) {
	let me;

	if (req.session.id != req.params.id) {
		if (req.session.isAdmin) {
			me = await Users.find({ _id: req.session.userId });
			me = me[0] || { validatePassword: () => false };
		} else {
			return res.status(403).json({
				ok: false,
				msg: "Não tem permissão para executar esta ação",
			});
		}
	}

	Users.findOne({ _id: req.params.id }, (err, user) => {
		if (err) res.sendStatus(500);
		else if (!user) res.sendStatus(404);
		else {
			try {
				if ((me || user).validatePassword(req.body.password)) {
					if (user.items.length != 0) res.sendStatus(409);
					else {
						Users.findOneAndDelete({ _id: req.params.id }, (err) => {
							if (err) res.sendStatus(500);
							else res.sendStatus(200);
						});
					}
				} else res.sendStatus(403);
			} catch {
				res.sendStatus(500);
			}
		}
	});
}

async function userInfo(req, res) {
	const { id } = req.params;

	if (!id || !/^[0-9a-f]+/gi.test(req.params.id)) {
		return res.status(400).json({
			ok: false,
			msg: "ID inválido!",
		});
	}

	try {
		const user = await Users.findById(id);

		if (!user) {
			return res.status(404).json({
				ok: false,
				msg: "User not found",
			});
		}

		const projects = await fetchProjects();

		return res.status(200).json({
			info: {
				ok: true,
				name: user.name,
				project: user.project,
				image: user.image ? user.decryptData("image") : null,
				imageDeleteHash: user.imageDeleteHash ? user.decryptData("imageDeleteHash") : null,
				isVirtual: user.isVirtual,
				isAdmin: user.isAdmin,
			},
			projects,
		});
	} catch {
		return res.status(500).json({
			ok: false,
		});
	}
}

function importFromExcel(req, res) {
	class UserException {
		constructor(message) {
			this.message = message;
			this.code = "file";
		}
	}

	const normal_fields = ["NAME", "EMAIL", "TYPE", "PROJECT", "PASSWORD"];

	function validate_titles(titles) {
		if (!titles || titles.length == 0) throw new UserException("Não existem títulos especificados.");

		if (!titles.includes("NAME")) throw new UserException("(NAME) Erro nos títulos: A coluna do nome é obrigatória.");
		else if (!titles.includes("EMAIL")) throw new UserException("(EMAIL) Erro nos títulos: A coluna do email é obrigatória.");
		else if (!titles.includes("TYPE")) throw new UserException("(TYPE) Erro nos títulos: A coluna do tipo é obrigatória.");
		else if (!titles.includes("PROJECT")) throw new UserException("(PROJECT) Erro nos títulos: A coluna do projeto é obrigatória.");
		else if (!titles.includes("PASSWORD")) throw new UserException("(PASSWORD) Erro nos títulos: A coluna da password é obrigatória.");
	}

	function isString(value) {
		return typeof value === "string";
	}

	excel.importFromWorkbook(req, res, async function (sheet, conn) {
		var titles = sheet.data[0];
		validate_titles(titles);

		var pos = {};
		normal_fields.forEach((f) => {
			pos[f] = titles.indexOf(f);
		});

		let usersList = [];
		await Promise.all([
			Users.find()
				.then((users) => {
					for (user of users) {
						usersList.push(user);
					}
				})
				.catch(() => {
					throw new UserException(
						"(GERAL) Ocorreu um erro durante o processamento dos dados. Por favor, tente novamente dentro de instantes..."
					);
				}),
		]);

		var emptyRow = -1;
		return Promise.all(
			sheet.data.map(async function (row, rowi) {
				return new Promise(async (resolve, reject) => {
					if (rowi == 0) return resolve();
					else {
						//garante que existe um nome e que não é a ultima linha (a qual pode estar vazia)
						if (!isString(row[pos["NAME"]]) || row[pos["NAME"]].length < 1) {
							for (let ci = 0; ci < titles.length; ci++) {
								if (row[ci]) {
									return reject(
										new UserException(`(NAME) Erro na linha ${rowi + 1}: Nome do utilizador não especificado.`)
									);
								}
							}
							emptyRow = rowi;
						}

						//garante que existe um tipo especificado
						if ((isNaN(row[pos["TYPE"]]) ? "" : row[pos["TYPE"]]).length < 1) {
							for (let ci = 0; ci < titles.length; ci++) {
								if (row[ci]) {
									return reject(
										new UserException(`(TYPE) Erro na linha ${rowi + 1}: Tipo do utilizador não especificado.`)
									);
								}
							}
							/*return reject(new UserException(`(TYPE) Erro na linha ${rowi + 1}: Tipo do utilizador não especificado.`));*/
						} else if (
							isNaN(row[pos["TYPE"]]) ||
							!Number.isInteger(parseFloat(row[pos["TYPE"]])) ||
							Number(row[pos["TYPE"]]) < 0 ||
							Number(row[pos["TYPE"]]) > 2
						) {
							return reject(
								new UserException(`(TYPE) Erro na linha ${rowi + 1}: O tipo de utilizador tem de ser 0, 1 ou 2.`)
							);
						}

						//verificações para os utilizadores reais e administradores
						if (Number(row[pos["TYPE"]]) != 0) {
							//garante que existe um email especificado com o formato nome.apelido@junitec.pt
							if (!isString(row[pos["EMAIL"]]) || row[pos["EMAIL"]].length < 1) {
								for (let ci = 0; ci < titles.length; ci++) {
									if (row[ci]) {
										return reject(
											new UserException(`(EMAIL) Erro na linha ${rowi + 1}: Email do utilizador não especificado.`)
										);
									}
								}
								/*return reject(
									new UserException(`(Aqui) Erro na linha ${rowi + 1}: Email do utilizador não especificado.`)
								); */
							} else if (!/^.+@junitec\.pt$/.test(row[pos["EMAIL"]])) {
								return reject(
									new UserException(
										`(EMAIL) Erro na linha ${
											rowi + 1
										}: O email do utilizador tem de ter o formato nome.apelido@junitec.pt.`
									)
								);
							}

							if (!isString(row[pos["PASSWORD"]]) || row[pos["PASSWORD"]].length < 8 || row[pos["PASSWORD"]].length > 30) {
								for (let ci = 0; ci < titles.length; ci++) {
									if (row[ci]) {
										return reject(
											new UserException(
												`(PASSWORD) Erro na linha ${rowi + 1}: A password tem de ter entre 8 e 30 caractéres.`
											)
										);
									}
								}
								/*return reject(
									new UserException(`(PASSWORD) Erro na linha ${rowi + 1}: A password tem de ter entre 8 e 30 caractéres.`)
								);*/
							}

							//garante que o utilizador é novo e não está em duplicado no excel
							let duplicatedLine = 0;
							usersList[0];
							if (rowi !== emptyRow) {
								if (usersList.find((user) => user.email && user.validateEmail(row[pos["EMAIL"]]))) {
									return reject(
										new UserException(
											`(EMAIL) Erro na linha ${
												rowi + 1
											}: Já existe um utilizador com o email especificado registado no sistema.`
										)
									);
								} else if (
									sheet.data.find((testRow, testRowIndex) => {
										if (
											testRowIndex != 0 &&
											testRowIndex != rowi &&
											testRow[pos["TYPE"]] != 0 &&
											testRow[pos["EMAIL"]] == row[pos["EMAIL"]]
										) {
											duplicatedLine = testRowIndex;
											return true;
										} else {
											return false;
										}
									})
								) {
									return reject(
										new UserException(
											`(EMAIL) Erro na linha ${
												rowi + 1
											}: Existem dois utilizadores com o mesmo email especificado (duplicado na linha ${
												duplicatedLine + 1
											}).`
										)
									);
								}
							}
						}
						//verificações para os utilizadores virtuais
						else {
							let duplicatedLine = 0;

							if (usersList.find((user) => !user.email && user.name == row[pos["NAME"]])) {
								return reject(
									new UserException(
										`(EMAIL) Erro na linha ${
											rowi + 1
										}: Já existe um utilizador com o nome especificado registado no sistema.`
									)
								);
							} else if (
								sheet.data.find((testRow, testRowIndex) => {
									if (
										testRowIndex != 0 &&
										testRowIndex != rowi &&
										testRow[pos["TYPE"]] == 0 &&
										testRow[pos["NAME"]] == row[pos["NAME"]]
									) {
										duplicatedLine = testRowIndex;
										return true;
									} else {
										return false;
									}
								})
							) {
								return reject(
									new UserException(
										`(EMAIL) Erro na linha ${
											rowi + 1
										}: Existem dois utilizadores com o mesmo nome especificado (duplicado na linha ${
											duplicatedLine + 1
										}).`
									)
								);
							}
						}

						//lógica para guardar os dados do excel
						if (rowi !== emptyRow) {
							let newUser = new Users();

							if (Number(row[pos["TYPE"]]) != 0) {
								let pwd = row[pos["PASSWORD"]] || "junitec123";

								newUser.hashEmail(row[pos["EMAIL"]]);
								newUser.hashPassword(pwd);

								newUser.isAdmin = Number(row[pos["TYPE"]]) == 2;
							}

							newUser.encryptData(row[pos["NAME"]] + "", "name");
							newUser.isVirtual = Number(row[pos["TYPE"]]) == 0;

							if (row[pos["PROJECT"]]) newUser.encryptData(row[pos["PROJECT"]] + "", "project");

							await Users.create([newUser], { session: conn });
						}

						resolve();
					}
				});
			})
		);
	});
}

module.exports = {
	fetchRequestableUsers,
	add,
	fetchUsers,
	pwchange,
	userUpdate,
	userDelete,
	userInfo,
	fetchItems,
	requestItems,
	releaseItems,
	importFromExcel,
	//changeDate,
};
