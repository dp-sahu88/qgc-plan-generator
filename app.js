// QGC Plan Generator Application with OpenLayers
class QGCPlanGenerator {
  constructor() {
    this.map = null;
    this.geoJsonData = null;
    this.waypoints = [];
    this.currentPlan = null;
    this.boundaryLayer = null;
    this.waypointLayer = null;
    this.pathLayer = null;
    this.homeLayer = null;
    this.vectorSource = null;
    this.keepTurnWaypoints = false;
    this.init();
  }

  init() {
    try {
      // Ensure loading overlay is hidden first
      this.showLoading(false);
      this.initMap();
      this.setupEventListeners();
    } catch (error) {
      console.error("Initialization error:", error);
      this.showLoading(false);
    }
  }

  initMap() {
    // Initialize OpenLayers map
    this.vectorSource = new ol.source.Vector();

    const vectorLayer = new ol.layer.Vector({
      source: this.vectorSource,
      style: this.getFeatureStyle.bind(this),
    });

    this.map = new ol.Map({
      target: "map",
      layers: [
        new ol.layer.Tile({
          source: new ol.source.OSM(),
        }),
        vectorLayer,
      ],
      view: new ol.View({
        center: ol.proj.fromLonLat([0, 0]),
        zoom: 2,
      }),
    });

    // Add popup overlay
    this.setupPopup();
  }

  setupPopup() {
    const popup = document.createElement("div");
    popup.className = "ol-popup";
    popup.style.cssText = `
            position: absolute;
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-base);
            padding: var(--space-8);
            box-shadow: var(--shadow-md);
            font-size: var(--font-size-sm);
            max-width: 200px;
            z-index: 1000;
        `;

    const overlay = new ol.Overlay({
      element: popup,
      autoPan: {
        animation: {
          duration: 250,
        },
      },
    });

    this.map.addOverlay(overlay);

    // Handle click events
    this.map.on("singleclick", (evt) => {
      const feature = this.map.forEachFeatureAtPixel(evt.pixel, (feature) => {
        return feature;
      });

      if (feature) {
        const props = feature.get("properties") || {};
        let content = "";

        if (props.type === "waypoint") {
          content = `Waypoint ${props.id}<br>Lat: ${props.lat.toFixed(
            6
          )}<br>Lng: ${props.lng.toFixed(6)}<br>Alt: ${props.alt}m`;
        } else if (props.type === "home") {
          content = `Home Position<br>Lat: ${props.lat.toFixed(
            6
          )}<br>Lng: ${props.lng.toFixed(6)}<br>Alt: ${props.alt}m`;
        } else if (props.type === "boundary") {
          content = "Mission Boundary";
        }

        if (content) {
          popup.innerHTML = content;
          overlay.setPosition(evt.coordinate);
        } else {
          overlay.setPosition(undefined);
        }
      } else {
        overlay.setPosition(undefined);
      }
    });
  }

  getFeatureStyle(feature) {
    const props = feature.get("properties") || {};

    if (props.type === "boundary") {
      return new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: "#1FB8CD",
          width: 2,
        }),
        fill: new ol.style.Fill({
          color: "rgba(31, 184, 205, 0.2)",
        }),
      });
    } else if (props.type === "waypoint") {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 12,
          fill: new ol.style.Fill({
            color: "#1FB8CD",
          }),
          stroke: new ol.style.Stroke({
            color: "#ffffff",
            width: 2,
          }),
        }),
        text: new ol.style.Text({
          text: props.id.toString(),
          font: "12px sans-serif",
          fill: new ol.style.Fill({
            color: "#ffffff",
          }),
        }),
      });
    } else if (props.type === "home") {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 16,
          fill: new ol.style.Fill({
            color: "#1FB8CD",
          }),
          stroke: new ol.style.Stroke({
            color: "#ffffff",
            width: 3,
          }),
        }),
        text: new ol.style.Text({
          text: "🏠",
          font: "16px sans-serif",
        }),
      });
    } else if (props.type === "path") {
      return new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: "#B4413C",
          width: 2,
          lineDash: [5, 5],
        }),
      });
    }

    return null;
  }

  setupEventListeners() {
    // File upload handlers
    this.setupFileUpload(
      "geojson-upload",
      "geojson-input",
      this.handleGeoJSONFile.bind(this)
    );

    // Form change handlers - debounced for performance
    const configInputs = [
      "vehicle-type",
      "firmware-type",
      "default-altitude",
      "cruise-speed",
      "hover-speed",
      "pattern-type",
      "waypoint-spacing",
      "altitude-mode",
      "turn-around-distance",
      "camera-trigger",
      "grid-angle",
      "overlap-percentage",
    ];

    configInputs.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener(
          "change",
          this.debounce(this.onConfigChange.bind(this), 300)
        );
        if (element.type === "number" || element.type === "range") {
          element.addEventListener(
            "input",
            this.debounce(this.onConfigChange.bind(this), 300)
          );
        }
      }
    });

    document
      .getElementById("pattern-type")
      .addEventListener("change", (e) => {
        const show = e.target.value === "survey";
        document.getElementById("turn-waypoints-group").style.display = show
          ? "block"
          : "none";
        this.onConfigChange();
      });

      document
      .getElementById("turn-waypoints-only")
      .addEventListener("change", (e) => {
        this.keepTurnWaypoints = e.target.checked;
        this.onConfigChange();
      });
    // Button handlers
    document
      .getElementById("generate-btn")
      .addEventListener("click", this.generatePlan.bind(this));
    document
      .getElementById("reset-view")
      .addEventListener("click", this.resetMapView.bind(this));
    document
      .getElementById("load-sample")
      .addEventListener("click", this.loadSampleData.bind(this));
    document
      .getElementById("download-plan")
      .addEventListener("click", this.downloadPlan.bind(this));
    document
      .getElementById("download-json")
      .addEventListener("click", this.downloadJSON.bind(this));
    document
      .getElementById("export-csv")
      .addEventListener("click", this.exportCSV.bind(this));
  }

  setupFileUpload(uploadAreaId, inputId, handler) {
    const uploadArea = document.getElementById(uploadAreaId);
    const input = document.getElementById(inputId);

    uploadArea.addEventListener("click", () => input.click());

    // Drag and drop handlers
    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.classList.add("drag-over");
    });

    uploadArea.addEventListener("dragleave", () => {
      uploadArea.classList.remove("drag-over");
    });

    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.classList.remove("drag-over");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handler(files[0]);
      }
    });

    input.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        handler(e.target.files[0]);
      }
    });
  }

  async handleGeoJSONFile(file) {
    const uploadArea = document.getElementById("geojson-upload");
    const info = document.getElementById("geojson-info");

    try {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("File too large (max 10MB)");
      }

      const text = await this.readFile(file);
      const data = JSON.parse(text);

      // Validate GeoJSON
      if (!this.validateGeoJSON(data)) {
        throw new Error("Invalid GeoJSON format or no polygon found");
      }

      this.geoJsonData = data;

      // Update UI
      uploadArea.classList.add("has-file");
      this.showFileInfo(
        info,
        `${file.name} (${this.formatFileSize(file.size)})`,
        "success"
      );

      // Display on map
      this.displayBoundary();
      this.enableGeneration();
    } catch (error) {
      this.showFileInfo(info, `Error: ${error.message}`, "error");
      uploadArea.classList.remove("has-file");
      console.error("GeoJSON file error:", error);
    }
  }

  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  validateGeoJSON(data) {
    if (!data.type) return false;

    if (data.type === "FeatureCollection") {
      return (
        data.features &&
        data.features.some(
          (feature) => feature.geometry && feature.geometry.type === "Polygon"
        )
      );
    }

    if (data.type === "Feature") {
      return data.geometry && data.geometry.type === "Polygon";
    }

    if (data.type === "Polygon") {
      return data.coordinates && data.coordinates.length > 0;
    }

    return false;
  }

  showFileInfo(element, message, type) {
    element.textContent = message;
    element.className = `file-info show ${type}`;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  displayBoundary() {
    // Clear existing boundary
    this.vectorSource.clear();

    const polygon = this.extractPolygon();
    if (!polygon) return;

    // Convert to OpenLayers format
    const coordinates = polygon.coordinates[0].map((coord) =>
      ol.proj.fromLonLat(coord)
    );
    const olPolygon = new ol.geom.Polygon([coordinates]);

    const feature = new ol.Feature({
      geometry: olPolygon,
      properties: { type: "boundary" },
    });

    this.vectorSource.addFeature(feature);
    this.resetMapView();
  }

  extractPolygon() {
    if (!this.geoJsonData) return null;

    if (this.geoJsonData.type === "FeatureCollection") {
      const polygonFeature = this.geoJsonData.features.find(
        (f) => f.geometry && f.geometry.type === "Polygon"
      );
      return polygonFeature ? polygonFeature.geometry : null;
    }

    if (this.geoJsonData.type === "Feature") {
      return this.geoJsonData.geometry;
    }

    if (this.geoJsonData.type === "Polygon") {
      return this.geoJsonData;
    }

    return null;
  }

  resetMapView() {
    if (this.vectorSource.getFeatures().length > 0) {
      const extent = this.vectorSource.getExtent();
      this.map.getView().fit(extent, {
        padding: [50, 50, 50, 50],
        duration: 500,
      });
    } else {
      // Reset to default view
      this.map.getView().setCenter(ol.proj.fromLonLat([0, 0]));
      this.map.getView().setZoom(2);
    }
  }

  enableGeneration() {
    document.getElementById("generate-btn").disabled = false;
  }

  onConfigChange() {
    // Real-time update when configuration changes
    if (this.geoJsonData && this.waypoints.length > 0) {
      // Don't auto-generate, just show notification
      const status = document.getElementById("plan-status");
      status.innerHTML =
        '<div class="status status--warning">Configuration changed - click Generate to update plan</div>';
    }
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  async generatePlan() {
    this.showLoading(true);

    try {
      // Small delay to allow UI to update
      await this.delay(100);

      // Generate waypoints
      this.generateWaypoints();

      // Create QGC plan
      this.createQGCPlan();

      // Update map
      this.displayWaypoints();

      // Update statistics
      this.updateStatistics();

      // Update UI
      this.updatePlanPreview();
      this.enableDownload();

      // Update status
      const status = document.getElementById("plan-status");
      status.innerHTML =
        '<div class="status status--success">Plan generated successfully</div>';
    } catch (error) {
      console.error("Plan generation error:", error);
      const status = document.getElementById("plan-status");
      status.innerHTML = `<div class="status status--error">Error: ${error.message}</div>`;
    } finally {
      this.showLoading(false);
    }
  }

  generateWaypoints() {
    const polygon = this.extractPolygon();
    if (!polygon) throw new Error("No valid polygon found");

    const pattern = document.getElementById("pattern-type").value;
    const spacing = parseFloat(
      document.getElementById("waypoint-spacing").value
    );
    const altitude = parseFloat(
      document.getElementById("default-altitude").value
    );
    const gridAngle =
      parseFloat(document.getElementById("grid-angle").value) || 0;

    switch (pattern) {
      case "survey":
        this.waypoints = this.generateSurveyGrid(
          polygon,
          spacing,
          altitude,
          gridAngle
        );
        break;
      case "perimeter":
        this.waypoints = this.generatePerimeter(polygon, spacing, altitude);
        break;
      case "vertices":
        this.waypoints = this.generateVertices(polygon, altitude);
        break;
      default:
        throw new Error("Invalid pattern type");
    }

    if (this.waypoints.length === 0) {
      throw new Error(
        "No waypoints generated. Try reducing spacing or check polygon validity."
      );
    }
  }

  generateSurveyGrid(polygon, spacing, altitude, angle) {
    const bounds = turf.bbox(polygon);
    const [minLng, minLat, maxLng, maxLat] = bounds;

    const waypoints = [];
    let waypointId = 1;

    // Calculate grid parameters
    const latStep = spacing / 111000; // Rough conversion: 1 degree ≈ 111km
    const lngStep =
      spacing / (111000 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));

    // Apply rotation if angle is specified
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const angleRad = (angle * Math.PI) / 180;

    // Generate grid points
    let isEvenRow = true;
    for (let lat = minLat; lat <= maxLat; lat += latStep) {
      const row = [];
      for (let lng = minLng; lng <= maxLng; lng += lngStep) {
        let finalLat = lat;
        let finalLng = lng;

        // Apply rotation if needed
        if (angle !== 0) {
          const rotatedCoords = this.rotatePoint(
            lng,
            lat,
            centerLng,
            centerLat,
            angleRad
          );
          finalLng = rotatedCoords[0];
          finalLat = rotatedCoords[1];
        }

        const point = turf.point([finalLng, finalLat]);
        if (turf.booleanPointInPolygon(point, polygon)) {
          row.push({
            id: waypointId++,
            lat: finalLat,
            lng: finalLng,
            alt: altitude,
          });
        }
      }

      // Alternate direction for efficient flight path
      if (!isEvenRow) {
        row.reverse();
      }

      waypoints.push(...row);
      isEvenRow = !isEvenRow;
    }

    return this.keepTurnWaypoints
      ? this.filterTurnWaypoints(waypoints)
      : waypoints;
  }

  filterTurnWaypoints(list) {
    if (list.length <= 2) return list;

    const keep = [list[0]];

    for (let i = 1; i < list.length - 1; i++) {
      const prev = list[i - 1];
      const curr = list[i];
      const next = list[i + 1];

      // bearing from prev→curr and curr→next
      const h1 = this.bearing(prev, curr);
      const h2 = this.bearing(curr, next);

      const delta = Math.abs(h1 - h2);
      if (delta > 5 && delta < 355) keep.push(curr); // turning point
    }
    keep.push(list[list.length - 1]);
    return keep;
  }

  // basic bearing (degrees) between two lat/lon points (flat enough for grids)
  bearing(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
    const x =
      Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
      Math.sin(toRad(a.lat)) *
        Math.cos(toRad(b.lat)) *
        Math.cos(toRad(b.lng - a.lng));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }


  rotatePoint(x, y, cx, cy, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const nx = cos * (x - cx) + sin * (y - cy) + cx;
    const ny = cos * (y - cy) - sin * (x - cx) + cy;
    return [nx, ny];
  }

  generatePerimeter(polygon, spacing, altitude) {
    const coordinates = polygon.coordinates[0];
    const waypoints = [];
    let waypointId = 1;

    // Create line string from polygon coordinates
    const line = turf.lineString(coordinates);
    const length = turf.length(line, { units: "meters" });

    // Generate points along perimeter
    const numPoints = Math.max(3, Math.floor(length / spacing));
    const step = length / numPoints;

    for (let i = 0; i < numPoints; i++) {
      const distance = i * step;
      const point = turf.along(line, distance / 1000, { units: "kilometers" });

      waypoints.push({
        id: waypointId++,
        lat: point.geometry.coordinates[1],
        lng: point.geometry.coordinates[0],
        alt: altitude,
      });
    }

    return waypoints;
  }

  generateVertices(polygon, altitude) {
    const coordinates = polygon.coordinates[0];
    const waypoints = [];

    // Use polygon vertices (excluding the closing point)
    for (let i = 0; i < coordinates.length - 1; i++) {
      waypoints.push({
        id: i + 1,
        lat: coordinates[i][1],
        lng: coordinates[i][0],
        alt: altitude,
      });
    }

    return waypoints;
  }

  createQGCPlan() {
    const vehicleType = parseInt(document.getElementById("vehicle-type").value);
    const firmwareType = parseInt(
      document.getElementById("firmware-type").value
    );
    const cruiseSpeed = parseFloat(
      document.getElementById("cruise-speed").value
    );
    const hoverSpeed = parseFloat(document.getElementById("hover-speed").value);
    const altitudeMode = parseInt(
      document.getElementById("altitude-mode").value
    );

    // Calculate home position (center of boundary)
    const polygon = this.extractPolygon();
    const centroid = turf.centroid(polygon);
    const homePosition = [
      centroid.geometry.coordinates[1], // lat
      centroid.geometry.coordinates[0], // lng
      parseFloat(document.getElementById("default-altitude").value), // alt
    ];

    // Create mission items
    const items = [];

    // Add takeoff command for copters
    if (vehicleType === 2) {
      // Copter
      items.push({
        AMSLAltAboveTerrain: null,
        Altitude: homePosition[2],
        AltitudeMode: altitudeMode,
        autoContinue: true,
        command: 22, // MAV_CMD_NAV_TAKEOFF
        doJumpId: 1,
        frame: 3,
        params: [
          15,
          0,
          0,
          null,
          homePosition[0],
          homePosition[1],
          homePosition[2],
        ],
        type: "SimpleItem",
      });
    }

    // Add waypoint commands
    this.waypoints.forEach((wp, index) => {
      const params = [0, 0, 0, null, wp.lat, wp.lng, wp.alt];

      // Add camera trigger if enabled
      if (document.getElementById("camera-trigger").checked) {
        params[6] = 1; // Camera trigger distance
      }

      items.push({
        AMSLAltAboveTerrain: null,
        Altitude: wp.alt,
        AltitudeMode: altitudeMode,
        autoContinue: true,
        command: 16, // MAV_CMD_NAV_WAYPOINT
        doJumpId: items.length + 1,
        frame: 3,
        params: params,
        type: "SimpleItem",
      });
    });

    // Add RTL command
    items.push({
      AMSLAltAboveTerrain: null,
      Altitude: homePosition[2],
      AltitudeMode: altitudeMode,
      autoContinue: true,
      command: 20, // MAV_CMD_NAV_RETURN_TO_LAUNCH
      doJumpId: items.length + 1,
      frame: 3,
      params: [0, 0, 0, null, 0, 0, 0],
      type: "SimpleItem",
    });

    // Create complete plan
    this.currentPlan = {
      fileType: "Plan",
      geoFence: {
        circles: [],
        polygons: [],
        version: 2,
      },
      groundStation: "QGroundControl",
      mission: {
        cruiseSpeed: cruiseSpeed,
        firmwareType: firmwareType,
        globalPlanAltitudeMode: altitudeMode,
        hoverSpeed: hoverSpeed,
        items: items,
        plannedHomePosition: homePosition,
        vehicleType: vehicleType,
        version: 2,
      },
      rallyPoints: {
        points: [],
        version: 2,
      },
      version: 1,
    };
  }

  displayWaypoints() {
    // Clear existing waypoint and path features, keep boundary
    const features = this.vectorSource.getFeatures();
    const boundaryFeatures = features.filter(
      (f) => f.get("properties")?.type === "boundary"
    );
    this.vectorSource.clear();
    boundaryFeatures.forEach((f) => this.vectorSource.addFeature(f));

    // Add home marker
    if (this.currentPlan && this.currentPlan.mission.plannedHomePosition) {
      const home = this.currentPlan.mission.plannedHomePosition;
      const homeCoord = ol.proj.fromLonLat([home[1], home[0]]);

      const homeFeature = new ol.Feature({
        geometry: new ol.geom.Point(homeCoord),
        properties: {
          type: "home",
          lat: home[0],
          lng: home[1],
          alt: home[2],
        },
      });

      this.vectorSource.addFeature(homeFeature);
    }

    // Add waypoint markers
    this.waypoints.forEach((wp) => {
      const coord = ol.proj.fromLonLat([wp.lng, wp.lat]);

      const feature = new ol.Feature({
        geometry: new ol.geom.Point(coord),
        properties: {
          type: "waypoint",
          id: wp.id,
          lat: wp.lat,
          lng: wp.lng,
          alt: wp.alt,
        },
      });

      this.vectorSource.addFeature(feature);
    });

    // Add flight path
    if (this.waypoints.length > 1) {
      const pathCoords = this.waypoints.map((wp) =>
        ol.proj.fromLonLat([wp.lng, wp.lat])
      );

      const pathFeature = new ol.Feature({
        geometry: new ol.geom.LineString(pathCoords),
        properties: { type: "path" },
      });

      this.vectorSource.addFeature(pathFeature);
    }
  }

  updateStatistics() {
    const totalWaypoints = this.waypoints.length;
    let totalDistance = 0;
    let areaCoverage = 0;

    // Calculate total distance
    if (this.waypoints.length > 1) {
      for (let i = 0; i < this.waypoints.length - 1; i++) {
        const from = turf.point([this.waypoints[i].lng, this.waypoints[i].lat]);
        const to = turf.point([
          this.waypoints[i + 1].lng,
          this.waypoints[i + 1].lat,
        ]);
        totalDistance += turf.distance(from, to, { units: "meters" });
      }
    }

    // Calculate area coverage
    if (this.geoJsonData) {
      const polygon = this.extractPolygon();
      if (polygon) {
        areaCoverage = turf.area(polygon);
      }
    }

    // Calculate estimated flight time
    const cruiseSpeed = parseFloat(
      document.getElementById("cruise-speed").value
    );
    const flightTime = totalDistance / cruiseSpeed / 60; // minutes

    // Update UI
    document.getElementById("total-waypoints").textContent = totalWaypoints;
    document.getElementById("total-distance").textContent = `${Math.round(
      totalDistance
    )} m`;
    document.getElementById("flight-time").textContent = `${Math.round(
      flightTime
    )} min`;
    document.getElementById("area-coverage").textContent = `${Math.round(
      areaCoverage
    )} m²`;
  }

  updatePlanPreview() {
    if (!this.currentPlan) return;

    const jsonString = JSON.stringify(this.currentPlan, null, 2);
    const codeElement = document.getElementById("plan-json");
    codeElement.textContent = jsonString;

    // Highlight syntax
    if (window.Prism) {
      Prism.highlightElement(codeElement);
    }
  }

  enableDownload() {
    document.getElementById("download-plan").disabled = false;
    document.getElementById("download-json").disabled = false;
    document.getElementById("export-csv").disabled = false;
  }

  downloadPlan() {
    if (!this.currentPlan) return;

    const jsonString = JSON.stringify(this.currentPlan, null, 2);
    this.downloadFile(jsonString, "mission.plan", "application/json");
  }

  downloadJSON() {
    if (!this.currentPlan) return;

    const jsonString = JSON.stringify(this.currentPlan, null, 2);
    this.downloadFile(jsonString, "mission.json", "application/json");
  }

  exportCSV() {
    if (!this.waypoints.length) return;

    let csv = "ID,Latitude,Longitude,Altitude,Type\n";

    // Add home position
    if (this.currentPlan && this.currentPlan.mission.plannedHomePosition) {
      const home = this.currentPlan.mission.plannedHomePosition;
      csv += `HOME,${home[0]},${home[1]},${home[2]},Home\n`;
    }

    // Add waypoints
    this.waypoints.forEach((wp) => {
      csv += `${wp.id},${wp.lat},${wp.lng},${wp.alt},Waypoint\n`;
    });

    this.downloadFile(csv, "waypoints.csv", "text/csv");
  }

  downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  showLoading(show) {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) {
      if (show) {
        overlay.classList.remove("hidden");
      } else {
        overlay.classList.add("hidden");
      }
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  loadSampleData() {
    // Load sample GeoJSON data for demonstration
    const sampleGeoJSON = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Sample Area" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-73.9857, 40.7484],
                [-73.9837, 40.7484],
                [-73.9837, 40.7464],
                [-73.9857, 40.7464],
                [-73.9857, 40.7484],
              ],
            ],
          },
        },
      ],
    };

    this.geoJsonData = sampleGeoJSON;
    this.displayBoundary();
    this.enableGeneration();

    // Update UI to show sample data loaded
    const uploadArea = document.getElementById("geojson-upload");
    const info = document.getElementById("geojson-info");
    uploadArea.classList.add("has-file");
    this.showFileInfo(info, "Sample data loaded (New York area)", "success");
  }
}

// Initialize application when DOM is loaded
document.addEventListener("readystatechange", () => {
  if (document.readyState === "complete") {
    try {
      new QGCPlanGenerator();
    } catch (error) {
      console.error("Failed to initialize QGC Plan Generator:", error);
      // Hide loading overlay in case of initialization error
    } finally {
      const overlay = document.getElementById("loading-overlay");
      if (overlay) {
        overlay.classList = 'hidden'
      }
    }
  }
});
