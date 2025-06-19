// 1. Configure your MapTiler API key
maptilersdk.config.apiKey = "R5Js2wLegZ6GMYd5iN2E";

// 2. Create the map
const map = new maptilersdk.Map({
	container: "map",
	style: maptilersdk.MapStyle.STREETS,
	center: [-79.94, 37.27],
	zoom: 10,
	navigationControl: false,
	geolocateControl: false,
});

map.on("load", () => {
	const isMobile = window.innerWidth < 768;

	fetch("./data.geojson")
		.then((res) => {
			if (!res.ok) throw new Error(`Failed to load GeoJSON (${res.status})`);
			return res.json();
		})
		.then((geojson) => {
			// Clean & normalize amount
			geojson.features.forEach((f) => {
				const raw = f.properties["Amount ARPA obligated"];
				const num = parseFloat(String(raw).replace(/,/g, ""));
				f.properties.amount = isNaN(num) ? 0 : num;
			});

			// pick one tuning knob: larger = bigger circles everywhere
			const R_SCALE = 0.009; // 0.008 … 0.010 is a good window

			// Add source & layer
			map.addSource("arpa-funds", { type: "geojson", data: geojson });

			map.addLayer({
				id: "city-funds-circle",
				type: "circle",
				source: "arpa-funds",
				filter: [
					"all",
					["has", "Amount city funds budgeted"],
					["!=", ["get", "Amount city funds budgeted"], null],
					[">", ["to-number", ["get", "Amount city funds budgeted"]], 0],
				],
				paint: {
					// radius = √ARPA * k  +  √CITY * k   (=> ring width encodes city money)
					"circle-radius": [
						"+",
						["*", R_SCALE, ["sqrt", ["to-number", ["get", "amount"]]]],
						[
							"*",
							R_SCALE,
							["sqrt", ["to-number", ["get", "Amount city funds budgeted"]]],
						],
					],

					/* give the ring its own tint so the thickness is visible */
					"circle-color": "rgba(255,127,0)",
					"circle-opacity": 0.6, // translucent so it doesn’t overpower
					"circle-stroke-color": "rgba(255,127,0)",
					"circle-stroke-width": 1.2,
					"circle-stroke-opacity": 0.6,
				},
			});
			console.log("layer added");

			// ARPA funds layer
			map.addLayer({
				id: "arpa-funds-circle",
				type: "circle",
				source: "arpa-funds",
				paint: {
					// radius = √ARPA * k   (same k so disks nest snugly)
					"circle-radius": [
						"case",
						/* keep a readable minimum — very small grants would vanish otherwise */
						[
							"<",
							["*", R_SCALE, ["sqrt", ["to-number", ["get", "amount"]]]],
							4,
						],
						4,
						["*", R_SCALE, ["sqrt", ["to-number", ["get", "amount"]]]],
					],

					"circle-color": "rgba(152,78,163)",
					"circle-opacity": 0.6,
					"circle-stroke-color": "rgba(152,78,163)",
					"circle-stroke-width": 1.5,
					"circle-stroke-opacity": 0.6,
				},
			});

			// ─── Build funding legend ─────────────────────────────────────
			(() => {
				const SAMPLES = [500000, 5000000, 15000000]; // 0.5 M · 5 M · 15 M

				// grab the elements we added in index.html
				const legend = document.getElementById("funds-legend");
				const legendBody = document.getElementById("legend-body");
				const toggleBtn = document.getElementById("legend-toggle");

				/* ---- populate the rows (same math as before) ---- */
				SAMPLES.forEach((amount) => {
					const r = Math.max(4, R_SCALE * Math.sqrt(amount)); // same min-radius rule

					const row = document.createElement("div");
					row.className = "legend-row";

					const circle = document.createElement("div");
					circle.className = "legend-circle";
					circle.style.width = `${2 * r}px`;
					circle.style.height = `${2 * r}px`;

					const label = document.createElement("span");
					label.textContent = `$${(amount / 1_000_000).toLocaleString(
						undefined,
						{
							maximumFractionDigits: amount < 1_000_000 ? 1 : 0,
						}
					)} M`;

					row.append(circle, label);
					legendBody.appendChild(row); // ⬅️  append to legendBody, not legend
				});

				const note = document.createElement("div");
				note.className = "legend-note";
				note.textContent =
					"Outer ring shows additional city dollars where applicable.";
				legendBody.appendChild(note);

				/* ---- collapse on phones ---- */
				if (window.matchMedia("(max-width: 600px)").matches) {
					legend.classList.add("collapsed"); // start closed
				}

				/* ---- toggle button ---- */
				toggleBtn.addEventListener("click", () => {
					legend.classList.toggle("collapsed");
					const expanded = !legend.classList.contains("collapsed");
					toggleBtn.setAttribute(
						"aria-label",
						expanded ? "Hide funding scale" : "Show funding scale"
					);
				});
			})();

			// Fit to data extent
			const valid = geojson.features.filter(
				(f) => f.geometry && Array.isArray(f.geometry.coordinates)
			);
			const coords = valid.map((f) => f.geometry.coordinates);
			if (coords.length) {
				const bounds = coords.reduce(
					(b, c) => b.extend(c),
					new maptilersdk.LngLatBounds(coords[0], coords[0])
				);
				map.fitBounds(bounds, { padding: 75, maxZoom: 14 });
			}

			// Populate the pull-up panel with city-wide (no-geometry) features
			const cityContainer = document.getElementById("city-wide-container");
			geojson.features
				.filter((f) => !(f.geometry && Array.isArray(f.geometry.coordinates)))
				.forEach((f) => {
					const props = f.properties;

					const card = document.createElement("div");
					card.className = "city-card";

					/* ---------- build the project-specific narrative ---------- */
					const amount = props["ARPA funds narrative"]; // already formatted string like “8,000,000.00”
					const spent = props["% ARPA spent by 24"]; // e.g. “43.12%”
					const narrative = `
									Roanoke obligated <span class="arpa-narrative-highlight">${amount}</span>
									dollars of its ARPA funds to this project. 
									By the end of 2024, it had spent 
									<span class="arpa-narrative-highlight">${spent}</span> of that amount.
									`;

					/* ---------- inject full accordion markup ---------- */
					card.innerHTML = `
									<!-- ALWAYS visible header -->
									<div class="card-header">
										<h3>${props["Project title"]}</h3>
									</div>

									<!-- Hidden until card gets .expanded -->
									<div class="card-extra">
										<p class="card-description">${props["Description"]}</p>
										<p class="card-narrative">${narrative}</p>
										<img src="${props["image_url"]}" alt="${props["Project title"]}" />
									</div>
									`;

					cityContainer.appendChild(card);

					// ─── accordion toggle ──────────────────────────────────────────
					card.addEventListener("click", () => {
						// 1. collapse any other open card (optional but nicer UX):
						document
							.querySelectorAll(".city-card.expanded")
							.forEach(
								(open) => open !== card && open.classList.remove("expanded")
							);

						// 2. toggle this card
						card.classList.toggle("expanded");

						// 3. ensure the expanded card stays fully in view inside the scroll area
						if (card.classList.contains("expanded")) {
							setTimeout(
								() =>
									card.scrollIntoView({ block: "nearest", behavior: "smooth" }),
								300
							);
						}
					});
				});

			// Hide mobile project‐card on desktop
			if (!isMobile) {
				document.getElementById("project-card").style.display = "none";
			}

			const panel = document.getElementById("city-wide-panel");

			// Unified click handler on circles
			let desktopPopup;

			map.on("click", "arpa-funds-circle", (e) => {
				const props = e.features[0].properties;
				const coords = e.features[0].geometry.coordinates;

				if (isMobile) {
					panel.classList.add("hidden");

					const title = props["Project title"];
					const description = props["Description"];
					const arpaAmount = props["ARPA funds narrative"]; // already formatted
					const spent = props["% ARPA spent by 24"];
					const img_url = props["image_url"];
					const cityBudget = props["Amount city funds budgeted"]; // raw number or null

					/* ---------- build narrative ---------- */
					let narrative = `
    Roanoke obligated <span class="arpa-narrative-highlight">${arpaAmount}</span>
    dollars of its ARPA funds to this project.
    By the end of 2024, it had spent
    <span class="arpa-narrative-highlight">${spent}</span> of that amount.
  `;

					if (cityBudget && Number(cityBudget) > 0) {
						const formattedCity = Number(cityBudget).toLocaleString();
						narrative += `
      <br>
      In addition to the federal ARPA funds, the city budgeted
      <span class="city-narrative-highlight">$${formattedCity}</span>
      of its own money to this project, though it is unknown how much of that has been spent.
    `;
					}

					// populate mobile card
					document.getElementById("card-title").textContent = title;
					document.getElementById("card-details").textContent = description;
					document.getElementById("card-narrative").innerHTML = narrative;

					const imgEl = document.getElementById("card-image");
					imgEl.src = img_url;
					imgEl.alt = title;

					document.getElementById("project-card").classList.add("visible");

					if (desktopPopup) {
						desktopPopup.remove();
						desktopPopup = null;
					}
				} else {
					document.getElementById("project-card").classList.remove("visible");
					if (desktopPopup) desktopPopup.remove();

					const arpaAmount = props["ARPA funds narrative"];
					const spent = props["% ARPA spent by 24"];
					const description = props["Description"];
					const img_url = props["image_url"];
					const cityBudget = props["Amount city funds budgeted"];

					let narrative = `
    Roanoke obligated <span class="arpa-narrative-highlight">${arpaAmount}</span>
    dollars of its ARPA funds to this project.
    By the end of 2024, it had spent
    <span class="arpa-narrative-highlight">${spent}</span> of that amount.
  `;

					if (cityBudget && Number(cityBudget) > 0) {
						const formattedCity = Number(cityBudget).toLocaleString();
						narrative += `
      <br>
      In addition to the federal ARPA funds, the city budgeted
      <span class="city-narrative-highlight">$${formattedCity}</span>
      of its own money to this project, though it is unknown how much of that has been spent.
    `;
					}

					const html = `
  <div class="project-card-desktop">
    <h3 class="pc-title">${props["Project title"]}</h3>
    <hr class="pc-divider" />
    <p class="pc-description">${description}</p>
    <p class="pc-narrative">${narrative}</p>
    <img class="pc-image" src="${img_url}" alt="${props["Project title"]}" />
  </div>`;

					desktopPopup = new maptilersdk.Popup({
						offset: [-1, -5],
						closeButton: false,
						closeOnClick: true,
					})
						.setLngLat(coords)
						.setHTML(html)
						.addTo(map);

					// ─── Grab your popup elements ──────────────────────────────────────
					const popupEl = desktopPopup
						.getElement()
						.querySelector(".project-popup");
					const mainPage = popupEl.querySelector(".popup-page.page-main");
					const detailsPage = popupEl.querySelector(".popup-page.page-details");

					// ─── Lock the popup height to page‐1 and make page‐2 scrollable ───
					const pageHeight = mainPage.getBoundingClientRect().height;
					popupEl.style.height = `${pageHeight}px`;
					detailsPage.style.maxHeight = `${pageHeight}px`;
					detailsPage.style.overflowY = "auto";
					detailsPage.style.webkitOverflowScrolling = "touch";

					// ─── Now wire up the DETAILS tab ─────────────────────────────────
					const tab = popupEl.querySelector(".details-tab");
					tab.addEventListener("click", () => {
						popupEl.classList.toggle("show-details");
						const arrow = tab.querySelector(".arrow");
						arrow.textContent = popupEl.classList.contains("show-details")
							? "←"
							: "→";
					});
				} // end mobile-desktop if else
			});

			// Outside‐click closes card or popup
			map.on("click", (e) => {
				const hits = map.queryRenderedFeatures(e.point, {
					layers: ["arpa-funds-circle"],
				});
				if (isMobile) {
					if (hits.length === 0) {
						document.getElementById("project-card").classList.remove("visible");
						panel.classList.remove("hidden");
					}
				} else {
					if (hits.length === 0 && desktopPopup) {
						desktopPopup.remove();
						desktopPopup = null;
					}
				}
			});
		})
		.catch((err) => console.error(err));

	// Mobile card close‐button
	document.getElementById("close-card").addEventListener("click", () => {
		// hide the project card
		document.getElementById("project-card").classList.remove("visible");
		// re-show the city-wide pull-up panel
		document.getElementById("city-wide-panel").classList.remove("hidden");
	});

	// Pull-up panel handle toggle
	const panel = document.getElementById("city-wide-panel");
	const handle = panel.querySelector(".panel-handle");
	handle.addEventListener("click", () => {
		panel.classList.toggle("open");
	});
});
