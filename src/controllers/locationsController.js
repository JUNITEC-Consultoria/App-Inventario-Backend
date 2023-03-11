const mongoose = require("mongoose");
const Promise = require("bluebird");

const excel = require("../modules/excel.js");

mongoose.set("useFindAndModify", false);

const Location = mongoose.model("Location");
const Item = mongoose.model("Item");
const User = mongoose.model("User");

module.exports = {
	async new(req, res) {
		const { value, parentId } = req.body;

		if (!/^(a{1}|c{1}|d{1}|s{1})([1-9]{1}[0-9]*)$/.test(value)) {
			return res.sendStatus(400);
		}

		// so armarios a que podem nao ter pai
		if ((value[0] != "a" && !parentId) || (value[0] == "a" && parentId)) {
			return res.sendStatus(400);
		}

		try {
			// ver se ja existe uma localizacao igual
			const location = await Location.findOne({ value, parentId });
			if (location) {
				return res.sendStatus(409);
			}

			// se nao existir ver se pai existe
			if (parentId) {
				const parentLocation = await Location.findById(parentId);

				if (!parentLocation) {
					return res.sendStatus(409);
				}

				// caixas so podem estar em armarios e divisoes em caixas
				if ((value[0] == "c" && parentLocation.value[0] != "a") || (value[0] == "d" && parentLocation.value[0] != "c")) {
					return res.sendStatus(400);
				}
			}

			// cria nova localizacao
			let newLocation = new Location();

			newLocation.value = value;
			if (parentId) {
				newLocation.parentId = parentId;
			}

			await newLocation.save();

			res.status(201).send({
				id: newLocation._id,
				parentId: newLocation.parentId ?? null,
				locationValue: newLocation.value,
			});
		} catch (err) {
			console.log(err);

			res.sendStatus(500);
		}
	},

	async get(req, res) {
		try {
			const locations = (await Location.find()).map((location) => ({
				id: location._id,
				parentId: location.parentId ?? null,
				locationValue: location.value,
			}));

			res.status(200).send(locations);
		} catch {
			res.sendStatus(500);
		}
	},

	// editar no limite so me devia deixar mudar o pai
	// isto esta basicamente a criar uma nova localizacao
	update(req, res) {
		try {
			Location.findOne({ id: req.params.id }, (err, location) => {
				if (err) res.sendStatus(500);
				else if (!location) res.sendStatus(404);
				else if (
					/^(a{1}|c{1}|d{1}|s{1})([1-9]{1}[0-9]*)$/.test(req.body.value) &&
					(!req.body.parentId ||
						(req.body.parentId && Number.isInteger(parseFloat(req.body.parentId)) && Number(req.body.parentId) > 0))
				) {
					Location.find({}, async (err, ExistingLocations) => {
						if (err) res.sendStatus(500);
						else {
							let parentExists = false;
							let alreadyExists = false;

							for (let existingLocation of ExistingLocations) {
								if (existingLocation.id == req.body.parentId) parentExists = true;
								if (
									existingLocation.value == req.body.value &&
									req.body.value[0] == "d" &&
									existingLocation.parentId == req.body.parentId
								)
									alreadyExists = true;
							}

							if (alreadyExists) {
								res.sendStatus(409);
							} else if (!req.body.parentId || (req.body.parentId && parentExists)) {
								if (parentExists) {
									let parent = (await Location.find({ id: req.body.parentId }))[0];

									if (parent.value[0] != "c" && req.body.value[0] == "d") {
										res.sendStatus(400);
										return;
									}
								}

								location.value = req.body.value;
								location.parentId = req.body.parentId ? Number(req.body.parentId) : null;

								location.save((err, location) => {
									if (err) res.sendStatus(500);
									else {
										res.status(200).send({
											id: location.id,
											parentId: location.parentId,
											locationValue: location.value[0],
											locationId: Number(location.value.slice(1)),
										});
									}
								});
							} else {
								res.sendStatus(400);
							}
						}
					});
				} else {
					res.sendStatus(400);
				}
			});
		} catch {
			res.sendStatus(500);
		}

		return;
	},

	async remove(req, res) {
		const { id } = req.params;

		try {
			let location = await Location.findOne({ parentId: id });
			// nao pode remover se tiver folhas ou itens
			if (location) {
				return res.status(409).send("child");
			}

			const item = await Item.findOne({ locationId: id });
			if (item) {
				return res.status(409).send("item");
			}

			location = await Location.findByIdAndDelete({ _id: id });

			if (!location) {
				return res.sendStatus(404);
			}

			return res.sendStatus(200);
		} catch (err) {
			return res.sendStatus(500);
		}
	},

	// same shit para aqui lmao
	// probably so o admin a que devia poder apagar localizacoes
	removeMultiple(req, res) {
		User.findById(req.session.userId)
			.then((user) => {
				if (!user) {
					res.sendStatus(404);
				} else if (!user.validatePassword(req.body.password)) {
					res.sendStatus(403);
				} else {
					Location.find()
						.then((locations) => {
							let selectedIds = req.body.ids;
							Item.find()
								.then((items) => {
									let locationInUse = false;
									for (let item of items) {
										if (selectedIds.includes(Number(item.decryptData("locationId")))) {
											locationInUse = true;
											break;
										}
									}

									if (!locationInUse) {
										let notSelected = locations.filter((l) => !selectedIds.includes(l.id));

										for (let locationId of selectedIds) {
											if (notSelected.find((l) => l.parentId == locationId)) {
												res.status(409).send("child");
												return;
											}
										}

										Location.deleteMany({ id: { $in: selectedIds } })
											.then(() => {
												res.sendStatus(200);
											})
											.catch(() => {
												res.sendStatus(500);
											});
									} else {
										res.status(409).send("item");
									}
								})
								.catch(() => {
									res.sendStatus(500);
								});
						})
						.catch(() => {
							res.sendStatus(500);
						});
				}
			})
			.catch(() => {
				res.sendStatus(500);
			});
	},

	// se apaga todas as localizacoes apaga todos os itens 4head
	// para alem do facto que nao tenho password pq nao fiz login normal ainda mais 4head
	removeAll(req, res) {
		User.findById(req.session.userId)
			.then((user) => {
				if (!user) {
					res.sendStatus(404);
				} else if (!user.validatePassword(req.body.password)) {
					res.sendStatus(403);
				} else {
					Location.find()
						.then((locations) => {
							if (!locations.length) {
								res.sendStatus(200);
							} else {
								Item.find()
									.then((items) => {
										let locationInUse = false;
										for (let item of items) {
											if (locations.find((l) => l.id == Number(item.decryptData("locationId")))) {
												locationInUse = true;
												break;
											}
										}

										if (!locationInUse) {
											Location.deleteMany()
												.then(() => {
													res.sendStatus(200);
												})
												.catch(() => {
													res.sendStatus(500);
												});
										} else {
											res.sendStatus(409);
										}
									})
									.catch(() => {
										res.sendStatus(500);
									});
							}
						})
						.catch(() => {
							res.sendStatus(500);
						});
				}
			})
			.catch(() => {
				res.sendStatus(500);
			});
	},

	importFromExcel(req, res) {
		class LocationException {
			constructor(message) {
				this.message = message;
				this.code = "file";
			}
		}

		const normal_fields = ["LOCATION", "PARENT"];

		function validate_titles(titles) {
			if (titles.length == 0) throw new LocationException("Não existem títulos especificados.");

			if (!titles.includes("LOCATION"))
				throw new LocationException("(LOCATION) Erro nos títulos: A coluna da localização é obrigatória.");
			else if (!titles.includes("PARENT"))
				throw new LocationException("(PARENT) Erro nos títulos: A coluna da localização-pai é obrigatória.");
		}

		function isString(value) {
			return typeof value === "string";
		}

		excel.importFromWorkbook(req, res, async function (sheet, conn) {
			let mustReturn = false;

			let titles = sheet.data[0];
			validate_titles(titles);

			var pos = {};
			normal_fields.forEach((f) => {
				pos[f] = titles.indexOf(f);
			});

			let id = 0;
			await Promise.all([
				Location.find()
					.then((locations) => {
						for (location of locations) {
							if (location.id > id) id = location.id;
						}
					})
					.catch(() => {
						throw new LocationException(
							"(GERAL) Ocorreu um erro durante o processamento dos dados. Por favor, tente novamente dentro de instantes..."
						);
					}),
			]);

			if (
				sheet.data.find(
					(row, rowi) =>
						rowi != 0 &&
						row[pos["LOCATION"]] &&
						row[pos["PARENT"]] &&
						row[pos["LOCATION"]].length >= 1 &&
						row[pos["PARENT"]].length >= 1 &&
						row[pos["LOCATION"]] == row[pos["PARENT"]]
				)
			) {
				throw new LocationException(
					`(PARENT!!!) Erro na linha ${rowi + 1}: A localização-pai não pode ser igual à própria localização.`
				);
			}

			return Promise.all(
				sheet.data.map(function (row, rowi) {
					return new Promise(async (resolve, reject) => {
						let locationParentExistsInExcel = false;
						let locationParentId = null;
						let locationParentLineIndex = null;
						let duplicatedLine = 0;

						if (rowi == 0) return resolve();
						else {
							//garante que existe uma localização indicada (com o formato correto) e que não é a ultima linha (a qual pode estar vazia)
							if (!isString(row[pos["LOCATION"]]) || row[pos["LOCATION"]].length < 1) {
								for (let ci = 0; ci < titles.length; ci++) {
									if (row[ci]) {
										return reject(
											new LocationException(`(LOCATION) Erro na linha ${rowi + 1}: Localização não especificada.`)
										);
									}
								}
							} else if (!/^(a{1}|c{1}|d{1}|s{1})([1-9]{1}[0-9]*)$/.test(row[pos["LOCATION"]])) {
								return reject(
									new LocationException(
										`(LOCATION) Erro na linha ${
											rowi + 1
										}: A localização indicada não respeita o formato aceitado (ex: a2).`
									)
								);
							}

							//garante que a localização-pai existe (com o formato correto) e que é diferente da localização filho
							if (isString(row[pos["PARENT"]]) && row[pos["PARENT"]].length > 0) {
								if (!/^(a{1}|c{1}|d{1}|s{1})([1-9]{1}[0-9]*)$/.test(row[pos["PARENT"]])) {
									return reject(
										new LocationException(
											`(PARENT) Erro na linha ${
												rowi + 1
											}: A localização-pai indicada não respeita o formato aceitado (ex: a2).`
										)
									);
								} else if (row[pos["LOCATION"]][0] == "d" && row[pos["PARENT"]][0] != "c") {
									return reject(
										new LocationException(
											`(PARENT) Erro na linha ${
												rowi + 1
											}: A localização-pai de uma divisão tem de ser obrigatoriamente uma caixa.`
										)
									);
								} else {
									await Promise.all([
										Location.find({ value: row[pos["PARENT"]] })
											.then((location) => {
												if (location.length) {
													locationParentId = location[0].id;
												} else {
													if (
														sheet.data.find((testRow, testRowIndex) => {
															if (testRowIndex != 0 && testRow[pos["LOCATION"]] == row[pos["PARENT"]]) {
																locationParentLineIndex = testRowIndex;
																locationParentId = testRowIndex + id;
																return true;
															} else {
																return false;
															}
														})
													) {
														locationParentExistsInExcel = true;
													} else {
														mustReturn = true;
														reject(
															new LocationException(
																`(Parent) Erro na linha ${rowi + 1}: A localização-pai indicada não existe.`
															)
														);
													}
												}
											})
											.catch(() => {
												mustReturn = true;
												reject(
													new LocationException(
														"(GERAL) Ocorreu um erro durante o processamento dos dados. Por favor, tente novamente dentro de instantes..."
													)
												);
											}),
									]);

									if (mustReturn) return;
								}
							} else if (row[pos["LOCATION"]][0] == "d") {
								return reject(
									new LocationException(
										`(Parent) Erro na linha ${
											rowi + 1
										}: A localização-pai de uma divisão tem de ser obrigatoriamente uma caixa."`
									)
								);
							}

							//garante que a localização é nova e não está em duplicado no excel (feito aqui pq é preciso garantir primeiro as regras da localização-pai)
							await Promise.all([
								Location.find({ value: row[pos["LOCATION"]] })
									.then((location) => {
										if (
											location.length &&
											(row[pos["LOCATION"]][0] != "d" ||
												(row[pos["LOCATION"]][0] == "d" && location[0].parentId == locationParentId))
										) {
											mustReturn = true;
											reject(
												new LocationException(
													`(LOCATION) Erro na linha ${rowi + 1}: A localização indicada já existe.`
												)
											);
										} else {
											if (
												sheet.data.find((testRow, testRowIndex) => {
													if (
														testRowIndex != 0 &&
														testRowIndex != rowi &&
														testRow[pos["LOCATION"]] == row[pos["LOCATION"]] &&
														(row[pos["LOCATION"]][0] != "d" || testRow[pos["PARENT"]] == row[pos["PARENT"]])
													) {
														duplicatedLine = testRowIndex;
														return true;
													} else {
														return false;
													}
												})
											) {
												mustReturn = true;
												reject(
													new LocationException(
														`(LOCATION) Erro na linha ${
															rowi + 1
														}: A localização indicada existe em duplicado (na linha ${duplicatedLine + 1}).`
													)
												);
											}
										}
									})
									.catch(() => {
										mustReturn = true;
										reject(
											new LocationException(
												"(GERAL) Ocorreu um erro durante o processamento dos dados. Por favor, tente novamente dentro de instantes..."
											)
										);
									}),
							]);

							if (mustReturn) return;

							//verifica o nesting das localizações caso o pai esteja no excel (ou seja também é uma localização nova)
							if (locationParentExistsInExcel) {
								do {
									if (sheet.data[locationParentLineIndex][pos["PARENT"]] == row[pos["LOCATION"]]) {
										return reject(
											new LocationException(
												`(LINKAGE) Erro na linha ${
													rowi + 1
												}: A localização-pai indicada é uma sub-localização da própria localização.`
											)
										);
									}

									locationParentLineIndex = sheet.data.findIndex(
										(testRow) => testRow[pos["LOCATION"]] == sheet.data[locationParentLineIndex][pos["PARENT"]]
									);
									locationParentLineIndex = locationParentLineIndex != -1 ? locationParentLineIndex : null;
								} while (locationParentLineIndex != null);
							}

							//lógica para guardar os dados do excel
							let data = {};

							data.id = rowi + id;
							data.value = row[pos["LOCATION"]];
							data.parentId = locationParentId;

							await Location.create([data], { session: conn });

							resolve();
						}
					});
				})
			);
		});
	},

	//

	async exportAsExcel(req, res) {
		function getLocationName(location) {
			const possibleLocations = [
				{ label: "Armário", value: "a" },
				{ label: "Caixa", value: "c" },
				{ label: "Divisão", value: "d" },
				{ label: "Saco", value: "s" },
			];

			return `${possibleLocations.find((l) => l.value == location[0]).label} ${Number(location.slice(1))}`;
		}

		function setColumnHeaders(sheet) {
			sheet.columns = [
				{
					header: "LOCATION NAME",
					key: "locationName",
					width: 30,
				},
				{
					header: "LOCATION",
					key: "location",
					width: 20,
				},
				{
					header: "PARENT NAME",
					key: "parentName",
					width: 30,
				},
				{
					header: "PARENT",
					key: "parent",
					width: 20,
				},
			];
		}

		function body(sheet, locations) {
			let rows = [];
			locations.forEach((location) => {
				let row = [location.locationName, location.locationValue, location.parentName, location.parentValue];

				rows.push(row);
			});

			sheet.addRows(rows);
		}

		excel.exportAsWorkbook(req, res, async function (sheet) {
			return new Promise((resolve, reject) => {
				setColumnHeaders(sheet);

				Location.find()
					.then((locations) => {
						let locationsList = [];
						for (let location of locations) {
							let parentValue = location.parentId ? locations.find((l) => l.id == location.parentId).value : "";
							let parentName = parentValue ? getLocationName(parentValue) : "";
							let locationValue = location.value;
							let locationName = getLocationName(locationValue);

							locationsList.push({
								locationName,
								locationValue,
								parentName,
								parentValue,
							});
						}
						body(sheet, locationsList);
						resolve();
					})
					.catch(() => {
						reject();
					});
			});
		});
	},
};
