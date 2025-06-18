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

			// Add source & layer
			map.addSource("arpa-funds", { type: "geojson", data: geojson });

			map.addLayer({
				id: "city-funds-circle",
				type: "circle",
				source: "arpa-funds",
				paint: {
					"circle-radius": [
						"interpolate",
						["linear"],
						["get", "Amount city funds budgeted"],
						0,
						0,
						3000000,
						36,
						8000000,
						38,
						11399055.97,
						40,
					],
					"circle-color": "green",
					"circle-stroke-color": "green",
					"circle-stroke-width": 2,
				},
			});

			// ARPA funds layer
			map.addLayer({
				id: "arpa-funds-circle",
				type: "circle",
				source: "arpa-funds",
				paint: {
					"circle-radius": [
						"interpolate",
						["linear"],
						["get", "amount"],
						25000,
						4,
						250000,
						8,
						1000000,
						12,
						3000000,
						20,
						8000000,
						26,
						11399055.97,
						32,
					],
					"circle-color": "rgba(117,107,177,0.6)",
					"circle-stroke-color": "rgba(117,107,177,1)",
					"circle-stroke-width": 3,
				},
			});

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
				map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
			}

			// Populate the pull-up panel with city-wide (no-geometry) features
			const cityContainer = document.getElementById("city-wide-container");
			geojson.features
				.filter((f) => !(f.geometry && Array.isArray(f.geometry.coordinates)))
				.forEach((f) => {
					const props = f.properties;
					const card = document.createElement("div");
					card.className = "city-card";
					card.innerHTML = `
            <h3>${props["Project title"]}</h3>
            <p><strong>Amount ARPA obligated:</strong>
               $${props["Amount ARPA obligated"]}</p>
          `;
					cityContainer.appendChild(card);
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
					const amount = props["ARPA funds narrative"];
					const spent = props["% ARPA spent by 24"];
					const img_url = props["image_url"];

					// build your narrative
					const narrative =
						`Roanoke obligated <span class="arpa-narrative-highlight">${amount}</span> dollars of its ARPA funds to this project. ` +
						`By the end of 2024, it had spent <span class="arpa-narrative-highlight">${spent}</span> of that amount.`;

					// populate
					document.getElementById("card-title").textContent = title;

					// FILL the long text
					document.getElementById("card-details").textContent = description;
					document.getElementById("card-narrative").innerHTML = narrative;

					// FILL the image
					const imgEl = document.getElementById("card-image");
					imgEl.src = img_url;
					imgEl.alt = title;

					// show card
					document.getElementById("project-card").classList.add("visible");

					// remove desktop popup if open
					if (desktopPopup) {
						desktopPopup.remove();
						desktopPopup = null;
					}
				} else {
					// remove bottom card if somehow visible
					document.getElementById("project-card").classList.remove("visible");

					// show desktop popup
					if (desktopPopup) desktopPopup.remove();

					const amount = props["ARPA funds narrative"];
					const spent = props["% ARPA spent by 24"];
					const description = props["Description"];
					const img_url = props["image_url"];

					// build narrative with highlight spans
					const narrative =
						`Roanoke obligated <span class="arpa-narrative-highlight">${amount}</span> dollars of its ARPA funds to this project. ` +
						`By the end of 2024, it had spent <span class="arpa-narrative-highlight">${spent}</span> of that amount.`;

					const html = `
								<div class="project-popup">
									<div class="popup-pages">
									<!-- PAGE 1 -->
									<div class="popup-page page-main">
										<h3>${props["Project title"]}</h3>
										<hr class="popup-divider" />
										<p>${description}</p>
										<p>${narrative}</p>
									</div>
									<!-- PAGE 2 -->
									<div class="popup-page page-details">
										<img src=${img_url} alt="${props["Project title"]}" />
										
									</div>
									</div>
									<div class="details-tab">
										<span class="details-label">DETAILS</span>
										<span class="arrow">→</span>
									</div>
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
