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
						6,
						1000000,
						10,
						3000000,
						16,
						8000000,
						24,
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
               ${props["Amount ARPA obligated"]}</p>
          `;
					cityContainer.appendChild(card);
				});

			// Hide mobile project‐card on desktop
			if (!isMobile) {
				document.getElementById("project-card").style.display = "none";
			}

			// Unified click handler on circles
			let desktopPopup;
			map.on("click", "arpa-funds-circle", (e) => {
				const props = e.features[0].properties;
				const coords = e.features[0].geometry.coordinates;

				if (isMobile) {
					// show bottom card
					document.getElementById("card-title").textContent =
						props["Project title"];
					document.getElementById("card-amount").textContent =
						props["Amount ARPA obligated"];
					document.getElementById("card-percent").textContent =
						props["% ARPA spent by 24"];
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
					const html = `
            <div class="project-popup">
              <h3>${props["Project title"]}</h3>
              <p><strong>Amount ARPA obligated:</strong>
                 ${props["Amount ARPA obligated"]}</p>
              <p><strong>% ARPA spent by 24:</strong>
                 ${props["% ARPA spent by 24"]}</p>
            </div>`;
					desktopPopup = new maptilersdk.Popup({
						offset: [-15, 15],
						closeButton: false,
						closeOnClick: true,
					})
						.setLngLat(coords)
						.setHTML(html)
						.addTo(map);
				}
			});

			// Outside‐click closes card or popup
			map.on("click", (e) => {
				const hits = map.queryRenderedFeatures(e.point, {
					layers: ["arpa-funds-circle"],
				});
				if (isMobile) {
					if (hits.length === 0) {
						document.getElementById("project-card").classList.remove("visible");
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
		document.getElementById("project-card").classList.remove("visible");
	});

	// Pull-up panel handle toggle
	const panel = document.getElementById("city-wide-panel");
	const handle = panel.querySelector(".panel-handle");
	handle.addEventListener("click", () => {
		panel.classList.toggle("open");
	});
});
