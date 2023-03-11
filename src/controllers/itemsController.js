const mongoose = require("mongoose");
const excel = require("../modules/excel.js");
const Promise = require("bluebird");

mongoose.set("useFindAndModify", false);

const Item = mongoose.model("Item");
const User = mongoose.model("User");
const Location = mongoose.model("Location");

const Requests = require("../models/Requests");
const Locations = require("../models/Locations");
const Items = require("../models/Items.js");

module.exports = {
	async new(req, res) {
		const { name, location, description, countable, totalStock } = req.body;

		// name is valid
		const cond1 = name && location;

		//item has valid stock quantity
		const cond2 =
			(countable && Number.isInteger(parseFloat(totalStock)) && Number(totalStock) >= 0 && !isNaN(parseFloat(totalStock))) ||
			(!countable && (totalStock !== "N/A" || totalStock !== "Disp."));

		if (!(cond1 && cond2)) {
			console.log("Asdasd");
			return res.sendStatus(400);
		}

		try {
			// nao deixa criar item com nome e localizacao e descricao igual
			const repeatItem = await Item.findOne({ name, description, locationId: location });

			if (repeatItem) {
				return res.sendStatus(400);
			}

			const item_loc = await Location.findById(req.body.location);

			if (!item_loc) {
				return res.sendStatus(400);
			}

			let newItem = new Item();
			req.body.totalStock = req.body.countable ? parseFloat(req.body.totalStock) : req.body.totalStock;
			newItem.name = req.body.name;
			newItem.countable = req.body.countable;

			if (req.body.countable) {
				newItem.totalStock = req.body.totalStock;
				newItem.availableStock = req.body.totalStock;
			} else {
				newItem.totalStock = req.body.inStock;
				newItem.availableStock = req.body.inStock;
			}

			newItem.locationId = req.body.location;

			newItem.imageLink = req.body.imageLink;

			newItem.image = req.body.image;

			newItem.imageDeleteHash = req.body.imageDeleteHash;

			newItem.description = req.body.description;

			const item = await newItem.save();

			return res.status(201).send(item._id);
		} catch (e) {
			console.log(e);
			return res.sendStatus(500);
		}
	},

	async get(req, res) {
		try {
			const items = (await Items.find()).map((item) => ({
				_id: item._id,
				name: item.name,
				countable: item.countable,
				totalStock: item.totalStock,
				availableStock: item.availableStock,
				locationId: item.locationId,
				image: item.image ? item.image : null,
			}));

			return res.send(items);
		} catch {
			return res.sendStatus(500);
		}
	},

	single(req, res) {
		Item.findOne({ _id: req.params.id }, async (err, item) => {
			if (err) res.sendStatus(500);
			else if (!item) res.sendStatus(404);
			else {
				let data = {
					//campos obrigatórios
					name: item.name,
					locationId: item.locationId,
					countable: item.countable,
					totalStock: item.totalStock,
					availableStock: item.availableStock,
					//campos opcionais
					image: item.image ? item.image : "",
					link: item.link ? item.link : "",
					linkTitle: item.linkTitle ? item.linkTitle : "",
					description: item.description ? item.description : "",
					imageDeleteHash: item.imageDeleteHash ? item.imageDeleteHash : "",
				};

				res.send(data);
			}
		});

		return;
	},

	async update(req, res) {
		// isValidItem(req);

		try {
			const item = await Item.findById({ _id: req.params.id });

			if (!item) {
				return res.sendStatus(404);
			}

			if (req.body.totalStock) {
				const { totalStock } = req.body;
				const oldStock = item.totalStock;

				if (
					// countable is going to be deprecated
					!(Number.isInteger(parseFloat(totalStock)) && Number(totalStock) >= 0 && !isNaN(parseFloat(totalStock)))
					//|| (!req.body.countable && (req.body.totalStock !== "N/A" || req.body.totalStock !== "Disp."))
				) {
					return res.sendStatus(400);
				}

				console.log(item.availableStock, totalStock - oldStock);
				item.availableStock = Number(item.availableStock) + totalStock - oldStock;
			}

			if (req.body.locationId) {
				const location = await Location.findById(req.body.location);

				if (!location) {
					return res.sendStatus(400);
				}
			}

			Object.assign(item, req.body);

			await item.save();

			return res.sendStatus(200);
		} catch (e) {
			console.log(e);
			res.sendStatus(500);
		}
	},

	// Pedido - { data, quantidade: +/- , pessoa,  }
	async userList(req, res) {
		const { iid, uid } = req.params;

		try {
			if (!iid || !/^[0-9a-f]+/gi.test(iid)) {
				return res.status(400).json({
					ok: false,
					msg: "ID inválido!",
				});
			}

			const users = (await User.find({ "items._id": iid })).map((user) => ({
				id: user._id,
				name: user.name,
				project: user.project,
				image: user.image ? user.decryptData("image") : null,
				quantity: user.items.find((item) => item._id == iid).quantity,
				self: user._id === uid,
				isVirtual: user.isVirtual ?? false,
				isAdmin: user.isAdmin ?? false,
			}));

			console.log(users);

			res.status(200).json({
				ok: true,
				users,
			});
		} catch (err) {
			console.log(err);

			return res.status(500).json({ ok: false });
		}
	},

	remove(req, res) {
		try {
			User.findOne({ "items._id": req.params.id }, (err, user) => {
				if (err) res.sendStatus(500);
				else if (user) res.sendStatus(403);
				else {
					try {
						Item.findOneAndDelete({ _id: req.params.id }, (err, item) => {
							if (err) res.sendStatus(500);
							else if (item) res.sendStatus(200);
							else res.sendStatus(404);
						});
					} catch {
						res.sendStatus(500);
					}
				}
			});
		} catch {
			res.sendStatus(500);
		}
	},

	async getItemRequests(req, res) {
		const { iid } = req.params;

		try {
			const item = await Items.findById(iid, { requests: 1 });
			const requests = await Requests.find(
				{ _id: { $in: item.requests } },
				{ name: 1, project: 1, item: 1, quantity: 1, date: 1, _id: 0 }
			).sort({
				date: -1,
			});

			return res.status(200).json({
				ok: true,
				requests,
			});
		} catch (err) {
			return res.sendStatus(500);
		}
	},

	importFromExcel(req, res) {
		class ItemException extends Error {
			constructor(message) {
				super();
				this.message = message;
				this.code = "file";
			}
		}

		function validateTitles(titles) {
			if (!titles || !titles.length) throw new ItemException("Não existem títulos especificados.");

			if (!titles.includes("NAME")) throw new ItemException("(NAME) Erro nos títulos: A coluna do nome é obrigatória.");
			else if (!titles.includes("LOCATION"))
				throw new ItemException("(LOCATION) Erro nos títulos: A coluna da localização é obrigatória.");
			else if (!titles.includes("TOTAL_STOCK"))
				throw new ItemException("(TOTAL_STOCK) Erro nos títulos: A coluna do stock total é obrigatória.");
			else if (!titles.includes("COUNTABLE"))
				throw new ItemException("(COUNTABLE) Erro nos títulos: A coluna de em stock é obrigatória.");
			else if (!titles.includes("IMAGE")) throw new ItemException("(IMAGE) Erro nos títulos: A coluna da imagem é obrigatória.");
			else if (!titles.includes("DESCRIPTION"))
				throw new ItemException("(DESCRIPTION) Erro nos títulos: A coluna da descrição é obrigatória.");
			else if (!titles.includes("LINK")) throw new ItemException("(LINK) Erro nos títulos: A coluna do link é obrigatória.");
			else if (!titles.includes("LINK_TITLE"))
				throw new ItemException("(LINK_TITLE) Erro nos títulos: A coluna do titulo do link é obrigatória.");
		}

		function validateItemRow(row, rowi, data, pos) {
			//garante que existe um nome e que não é a ultima linha (a qual pode estar vazia)
			if (!row[pos["NAME"]].length) {
				throw new ItemException(`(NAME) Erro na linha ${rowi + 1}: Nome do item não especificado.`);
			}

			//garante que existe uma localização
			if (!row[pos["LOCATION"]].length) {
				throw new ItemException(`(LOCATION) Erro na linha ${rowi + 1}: Localização do item não especificada.`);
			}

			// tem de especificar se e contavel ou nao
			if (!row[pos["COUNTABLE"]].length || (row[pos["COUNTABLE"]] !== "true" && row[pos["COUNTABLE"]] !== "false")) {
				throw new ItemException(`(COUNTABLE) Erro na linha ${rowi + 1}: Especifique se o item é contável.`);
			}

			//garante que existe stock especificado
			if (row[pos["COUNTABLE"]] === "true") {
				if (!row[pos["TOTAL_STOCK"]]) {
					throw new ItemException(`(TOTAL_STOCK) Erro na linha ${rowi + 1}: Stock total do item não especificado.`);
				}

				if (
					isNaN(row[pos["TOTAL_STOCK"]]) ||
					Number(row[pos["TOTAL_STOCK"]]) < 0 ||
					!Number.isInteger(parseFloat(row[pos["TOTAL_STOCK"]]))
				) {
					throw new ItemException(`(TOTAL_STOCK) Erro na linha ${rowi + 1}: Formato incorreto para o stock total do item.`);
				}
			}

			if (row[pos["COUNTABLE"]] === "false" && !(row[pos["TOTAL_STOCK"]] !== "Disp." || row[pos["TOTAL_STOCK"]] !== "N/A")) {
				throw new ItemException(`(TOTAL_STOCK) Erro na linha ${rowi + 1}: Formato incorreto para o stock total do item.`);
			}

			//garante que o item não está duplicado no excel
			const itemIndex = data.findIndex(
				(testRow, testRowIndex) =>
					testRowIndex != 0 &&
					testRowIndex != rowi &&
					testRow[pos["LOCATION"]] == row[pos["LOCATION"]] &&
					testRow[pos["NAME"]] == row[pos["NAME"]] &&
					testRow[pos["DESCRIPTION"]] == row[pos["DESCRIPTION"]]
			);

			if (itemIndex !== -1) {
				throw new ItemException(
					`(ITEM) Erro na linha ${rowi + 1}: Existem dois itens iguais especificados (duplicado na linha ${duplicatedLine + 1}).`
				);
			}
		}

		async function parseItemLocation(location, rowi) {
			if (!/(a\d+)?c\d+(d\d+)?/gi.test(location)) {
				throw new ItemException(`(LOCATION) Erro na linha ${rowi + 1}: Formato das localizações incorreto.`);
			}

			// handling location
			const loc = {
				// armario da default para a1
				armario: location.includes("a") ? location.substr(location.indexOf("a"), location.indexOf("c")) : "a1",
				// ha sempre caixa
				caixa: location.includes("d")
					? location.substr(location.indexOf("c"), location.indexOf("d") - location.indexOf("c"))
					: location.substr(location.indexOf("c"), location.length - location.indexOf("c")),
				// pode nao haver divisao
				divisao: location.includes("d") ? location.substr(location.indexOf("d"), location.length) : "",
			};

			try {
				const armario = await Locations.findOne({ value: loc.armario });
				if (!armario) {
					throw new ItemException(`(LOCATION) Erro na linha ${rowi + 1}: O armário indicada não existe.`);
				}

				let finalLoc = await Locations.findOne({ value: loc.caixa, parentId: armario.id });
				if (!finalLoc) {
					throw new ItemException(`(LOCATION) Erro na linha ${rowi + 1}: A caixa indicada não existe.`);
				}

				// se existir divisao procurar
				if (loc.divisao.length) {
					finalLoc = await Locations.findOne({ value: loc.divisao, parentId: finalLoc.id });

					if (!finalLoc) {
						throw new ItemException(`(LOCATION) Erro na linha ${rowi + 1}: A divisão indicada não existe.`);
					}
				}

				return finalLoc.id;
			} catch (err) {
				if (err.code === "file") {
					throw err;
				}

				throw new ItemException(
					"(GERAL) Ocorreu um erro durante o processamento dos dados. Por favor, tente novamente dentro de instantes..."
				);
			}
		}

		// isto a que e a funcao mesmo
		excel.importFromWorkbook(req, res, (sheet) => {
			const titles = sheet.data.shift();

			validateTitles(titles);

			// ta a fazer um mapa das colunas para o seu indice
			const pos = {};
			["NAME", "TOTAL_STOCK", "COUNTABLE", "LOCATION", "IMAGE", "DESCRIPTION", "LINK", "LINK_TITLE"].forEach(
				(f) => (pos[f] = titles.indexOf(f))
			);

			// usa se o map para obter um array de Promises para o all
			return Promise.all(
				sheet.data.map((row, rowi) => {
					return new Promise(async (resolve, reject) => {
						//skipa vazias
						if (!row.length) return;

						try {
							validateItemRow(row, rowi, sheet.data, pos);
							const locationId = await parseItemLocation(row[pos["LOCATION"]], rowi);

							//lógica para guardar os dados do excel
							const newItem = {};

							newItem.name = row[pos["NAME"]];

							newItem.locationId = locationId;

							newItem.totalStock = row[pos["TOTAL_STOCK"]];
							newItem.availableStock = row[pos["TOTAL_STOCK"]];
							newItem.countable = row[pos["COUNTABLE"]];

							if (row[pos["IMAGE"]]) {
								newItem.image = row[pos["IMAGE"]];
							}

							if (row[pos["DESCRIPTION"]]) {
								newItem.description = row[pos["DESCRIPTION"]];
							}

							if (row[pos["LINK"]]) {
								newItem.link = row[pos["LINK"]];
								newItem.linkTitle = row[pos["LINK_TITLE"]];
							}

							// ve se o item ja existe e da update ou cria um novo
							await Items.findOneAndUpdate(
								{ name: newItem.name, description: newItem.description, locationId: newItem.locationId },
								newItem,
								{ upsert: true }
							);

							resolve();
						} catch (err) {
							if (err.code === "file") {
								reject(err);
							}

							reject(
								new ItemException(
									"(GERAL) Ocorreu um erro durante o processamento dos dados. Por favor, tente novamente dentro de instantes..."
								)
							);
						}
					});
				})
			);
		});
	},
};
