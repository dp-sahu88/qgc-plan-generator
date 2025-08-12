      // QGroundControl Plan Generator Application - Fixed Version
      class QGCPlanGenerator {
          constructor() {
              this.map = null;
              this.boundaryData = null;
              this.currentPlan = null;
              this.waypoints = [];
              this.cameraPoints = [];
              this.debounceTimeout = null;
              this.validationErrors = new Set();
              
              // MAVLink Commands
              this.MAV_CMD = {
                  NAV_WAYPOINT: 16,
                  NAV_TAKEOFF: 22,
                  NAV_LAND: 21,
                  NAV_RTL: 20,
                  DO_SET_CAM_TRIGG_DIST: 206,
                  SET_CAMERA_MODE: 530,
                  DO_DIGICAM_CONTROL: 203
              };
              
              // Application data
              this.appData = {
                  "mavlink_commands": {
                      "NAV_WAYPOINT": 16,
                      "NAV_TAKEOFF": 22,
                      "NAV_LAND": 21,
                      "NAV_RTL": 20,
                      "DO_SET_CAM_TRIGG_DIST": 206,
                      "SET_CAMERA_MODE": 530,
                      "DO_DIGICAM_CONTROL": 203
                  },
                  "vehicle_types": {
                      "2": "Multi-Rotor",
                      "1": "Fixed Wing", 
                      "10": "Ground Vehicle",
                      "19": "VTOL"
                  },
                  "firmware_types": {
                      "12": "PX4",
                      "3": "ArduPilot"
                  },
                  "altitude_modes": {
                      "1": "Relative to Home",
                      "2": "Absolute (MSL)",
                      "3": "Above Terrain"
                  },
                  "camera_presets": {
                      "Custom Camera": {
                          "imageWidth": 4000,
                          "imageHeight": 3000,
                          "sensorWidth": 6.17,
                          "sensorHeight": 4.55,
                          "focalLength": 4.5
                      },
                      "Sony ILCE-QX1": {
                          "imageWidth": 5456,
                          "imageHeight": 3632,
                          "sensorWidth": 23.2,
                          "sensorHeight": 15.4,
                          "focalLength": 16
                      },
                      "Manual": {
                          "imageWidth": 1920,
                          "imageHeight": 1080,
                          "sensorWidth": 5.7,
                          "sensorHeight": 4.3,
                          "focalLength": 3.5
                      }
                  },
                  "sample_geojson": {
                      "type": "Feature",
                      "properties": {"name": "Sample Survey Area"},
                      "geometry": {
                          "type": "Polygon",
                          "coordinates": [[
                              [-73.9857, 40.7484],
                              [-73.9837, 40.7484],
                              [-73.9837, 40.7464],
                              [-73.9857, 40.7464],
                              [-73.9857, 40.7484]
                          ]]
                      }
                  }
              };
              
              this.init();
          }
          
          init() {
              this.initMap();
              this.bindEvents();
              this.initCollapsible();
              this.updatePlanStatus('Ready');
              this.handlePatternChange(); // Initialize pattern visibility
              this.validateAllInputs(); // Initial validation
          }
          
          initMap() {
              this.map = L.map('map').setView([40.7484, -73.9847], 15);
              
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                  attribution: '© OpenStreetMap contributors'
              }).addTo(this.map);
              
              // Initialize layer groups
              this.boundaryLayer = L.layerGroup().addTo(this.map);
              this.waypointLayer = L.layerGroup().addTo(this.map);
              this.pathLayer = L.layerGroup().addTo(this.map);
              this.cameraLayer = L.layerGroup().addTo(this.map);
          }
          
          bindEvents() {
              // File upload events
              document.getElementById('load-sample').addEventListener('click', () => this.loadSampleData());
              document.getElementById('upload-geojson').addEventListener('click', () => document.getElementById('geojson-file').click());
              document.getElementById('geojson-file').addEventListener('change', (e) => this.handleFileUpload(e));
              
              // Drop zone events
              const dropZone = document.getElementById('drop-zone');
              dropZone.addEventListener('click', () => document.getElementById('geojson-file').click());
              dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
              dropZone.addEventListener('drop', this.handleDrop.bind(this));
              dropZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
              
              // Form change events with validation
              const formInputs = document.querySelectorAll('input, select');
              formInputs.forEach(input => {
                  input.addEventListener('change', () => {
                      this.validateInput(input);
                      this.debouncedUpdate();
                  });
                  input.addEventListener('input', () => {
                      this.validateInput(input);
                      this.debouncedUpdate();
                  });
              });
              
              // Special events
              document.getElementById('pattern-type').addEventListener('change', this.handlePatternChange.bind(this));
              document.getElementById('camera-trigger').addEventListener('change', this.handleCameraTriggerChange.bind(this));
              document.getElementById('camera-name').addEventListener('change', this.handleCameraPresetChange.bind(this));
              document.getElementById('grid-angle').addEventListener('input', this.updateGridAngleDisplay.bind(this));
              
              // Generate and export events
              document.getElementById('generate-plan').addEventListener('click', () => this.generatePlan());
              document.getElementById('export-plan').addEventListener('click', () => this.exportPlan());
              document.getElementById('export-json').addEventListener('click', () => this.exportJSON());
              document.getElementById('export-csv').addEventListener('click', () => this.exportCSV());
          }
          
          // Enhanced Form Validation
          validateInput(input) {
              const value = parseFloat(input.value);
              const min = parseFloat(input.min);
              const max = parseFloat(input.max);
              const errorElement = document.getElementById(`${input.id}-error`);
              
              let isValid = true;
              let errorMessage = '';
              
              // Clear previous error state
              input.classList.remove('error');
              if (errorElement) {
                  errorElement.textContent = '';
              }
              
              // Validate based on input type and constraints
              if (input.type === 'number') {
                  if (isNaN(value) || value === '') {
                      isValid = false;
                      errorMessage = 'Please enter a valid number';
                  } else if (!isNaN(min) && value < min) {
                      isValid = false;
                      errorMessage = `Value must be at least ${min}`;
                  } else if (!isNaN(max) && value > max) {
                      isValid = false;
                      errorMessage = `Value must be no more than ${max}`;
                  }
                  
                  // Special validations
                  switch (input.id) {
                      case 'altitude':
                          if (value <= 0) {
                              isValid = false;
                              errorMessage = 'Altitude must be positive';
                          }
                          break;
                      case 'cruise-speed':
                      case 'hover-speed':
                          if (value <= 0) {
                              isValid = false;
                              errorMessage = 'Speed must be positive';
                          }
                          break;
                      case 'frontal-overlap':
                      case 'side-overlap':
                          if (value < 50 || value > 90) {
                              isValid = false;
                              errorMessage = 'Overlap must be between 50% and 90%';
                          }
                          break;
                      case 'sensor-width':
                      case 'sensor-height':
                      case 'focal-length':
                          if (value <= 0) {
                              isValid = false;
                              errorMessage = 'Value must be positive';
                          }
                          break;
                  }
              }
              
              if (!isValid) {
                  input.classList.add('error');
                  if (errorElement) {
                      errorElement.textContent = errorMessage;
                  }
                  this.validationErrors.add(input.id);
              } else {
                  this.validationErrors.delete(input.id);
              }
              
              // Update generate button state
              this.updateGenerateButtonState();
              
              return isValid;
          }
          
          validateAllInputs() {
              const inputs = document.querySelectorAll('input[type="number"]');
              inputs.forEach(input => this.validateInput(input));
          }
          
          updateGenerateButtonState() {
              const generateBtn = document.getElementById('generate-plan');
              const hasErrors = this.validationErrors.size > 0;
              const hasBoundary = !!this.boundaryData;
              
              generateBtn.disabled = hasErrors || !hasBoundary;
          }
          
          initCollapsible() {
              const toggle = document.getElementById('advanced-toggle');
              const content = document.getElementById('advanced-options');
              const icon = toggle.querySelector('.toggle-icon');
              
              toggle.addEventListener('click', () => {
                  const isCollapsed = content.classList.contains('collapsed');
                  if (isCollapsed) {
                      content.classList.remove('collapsed');
                      icon.classList.add('expanded');
                  } else {
                      content.classList.add('collapsed');
                      icon.classList.remove('expanded');
                  }
              });
          }
          
          handleDragOver(e) {
              e.preventDefault();
              document.getElementById('drop-zone').classList.add('dragover');
          }
          
          handleDragLeave(e) {
              document.getElementById('drop-zone').classList.remove('dragover');
          }
          
          handleDrop(e) {
              e.preventDefault();
              document.getElementById('drop-zone').classList.remove('dragover');
              
              const files = e.dataTransfer.files;
              if (files.length > 0) {
                  this.processFile(files[0]);
              }
          }
          
          handleFileUpload(e) {
              const file = e.target.files[0];
              if (file) {
                  this.processFile(file);
              }
          }
          
          processFile(file) {
              if (!file.name.toLowerCase().endsWith('.json') && !file.name.toLowerCase().endsWith('.geojson')) {
                  this.showError('Please select a valid GeoJSON or JSON file');
                  return;
              }
              
              const reader = new FileReader();
              reader.onload = (e) => {
                  try {
                      const data = JSON.parse(e.target.result);
                      this.loadBoundaryData(data);
                  } catch (error) {
                      this.showError('Invalid JSON file: ' + error.message);
                      console.error('File parsing error:', error);
                  }
              };
              reader.onerror = () => {
                  this.showError('Error reading file');
              };
              reader.readAsText(file);
          }
          
          loadSampleData() {
              console.log('Loading sample data...');
              this.loadBoundaryData(this.appData.sample_geojson);
          }
          
          loadBoundaryData(geojson) {
              console.log('Loading boundary data:', geojson);
              if (geojson.type === 'FeatureCollection'&& geojson.features.length > 0) {
                  geojson = geojson.features[0];
              }
              
              if (!geojson || !geojson.geometry) {
                  this.showError('Invalid GeoJSON format - missing geometry');
                  return;
              }
              
              if (geojson.geometry.type !== 'Polygon' && geojson.geometry.type !== 'MultiPolygon') {
                  this.showError('Only Polygon and MultiPolygon geometries are supported');
                  return;
              }
              
              // For MultiPolygon, take the first polygon
              if (geojson.geometry.type === 'MultiPolygon') {
                  if (geojson.geometry.coordinates.length === 0) {
                      this.showError('MultiPolygon has no coordinates');
                      return;
                  }
                  // Convert to single polygon
                  geojson.geometry.type = 'Polygon';
                  geojson.geometry.coordinates = geojson.geometry.coordinates[0];
              }
              
              // Validate polygon coordinates
              if (!Array.isArray(geojson.geometry.coordinates) || geojson.geometry.coordinates.length === 0) {
                  this.showError('Invalid polygon coordinates');
                  return;
              }
              
              const coords = geojson.geometry.coordinates[0];
              if (!Array.isArray(coords) || coords.length < 4) {
                  this.showError('Polygon must have at least 4 coordinate points');
                  return;
              }
              
              this.boundaryData = geojson;
              this.displayBoundary();
              this.updateBoundaryInfo();
              this.updateGenerateButtonState();
              this.debouncedUpdate();
              
              console.log('Boundary data loaded successfully');
          }
          
          displayBoundary() {
              this.boundaryLayer.clearLayers();
              
              if (this.boundaryData && this.boundaryData.geometry) {
                  try {
                      const layer = L.geoJSON(this.boundaryData, {
                          style: {
                              color: '#1FB8CD',
                              weight: 3,
                              fillColor: '#1FB8CD',
                              fillOpacity: 0.1
                          }
                      }).addTo(this.boundaryLayer);
                      
                      this.map.fitBounds(layer.getBounds());
                  } catch (error) {
                      this.showError('Error displaying boundary: ' + error.message);
                  }
              }
          }
          
          updateBoundaryInfo() {
              if (this.boundaryData) {
                  const name = this.boundaryData.properties?.name || 'Loaded Area';
                  const area = this.calculatePolygonArea(this.boundaryData.geometry.coordinates[0]);
                  
                  document.getElementById('boundary-name').textContent = name;
                  document.getElementById('boundary-area').textContent = Math.round(area).toLocaleString();
                  document.getElementById('boundary-info').classList.remove('hidden');
              }
          }
          
          handlePatternChange() {
              const patternType = document.getElementById('pattern-type').value;
              const turnWaypointsGroup = document.getElementById('turn-waypoints-group');
              console.log('Pattern changed to:', patternType);
              
              if (patternType === 'survey') {
                  turnWaypointsGroup.style.display = 'block';
                  console.log('Showing survey-specific options');
              } else {
                  turnWaypointsGroup.style.display = 'none';
                  document.getElementById('turn-waypoints-only').checked = false;
                  console.log('Hiding survey-specific options');
              }
              
              this.debouncedUpdate();
          }
          
          handleCameraTriggerChange() {
              const cameraSettings = document.getElementById('camera-settings');
              const isEnabled = document.getElementById('camera-trigger').checked;
              
              console.log('Camera trigger changed to:', isEnabled);
              
              if (isEnabled) {
                  cameraSettings.style.display = 'block';
                  cameraSettings.classList.add('fade-in');
                  console.log('Showing camera settings');
              } else {
                  cameraSettings.style.display = 'none';
                  console.log('Hiding camera settings');
              }
              
              this.debouncedUpdate();
          }
          
          handleCameraPresetChange() {
              const cameraName = document.getElementById('camera-name').value;
              const preset = this.appData.camera_presets[cameraName];
              
              if (preset) {
                  document.getElementById('image-width').value = preset.imageWidth;
                  document.getElementById('image-height').value = preset.imageHeight;
                  document.getElementById('sensor-width').value = preset.sensorWidth;
                  document.getElementById('sensor-height').value = preset.sensorHeight;
                  document.getElementById('focal-length').value = preset.focalLength;
                  
                  // Re-validate the updated inputs
                  ['image-width', 'image-height', 'sensor-width', 'sensor-height', 'focal-length'].forEach(id => {
                      const input = document.getElementById(id);
                      this.validateInput(input);
                  });
              }
              
              this.debouncedUpdate();
          }
          
          updateGridAngleDisplay() {
              const angle = document.getElementById('grid-angle').value;
              document.getElementById('grid-angle-value').textContent = `${angle}°`;
          }
          
          debouncedUpdate() {
              clearTimeout(this.debounceTimeout);
              this.debounceTimeout = setTimeout(() => {
                  this.updateVisualization();
              }, 300);
          }
          
          updateVisualization() {
              if (!this.boundaryData) {
                  console.log('No boundary data for visualization');
                  return;
              }
              
              const patternType = document.getElementById('pattern-type').value;
              this.clearLayers();
              
              console.log('Updating visualization for pattern:', patternType);
              
              try {
                  switch (patternType) {
                      case 'survey':
                          this.generateSurveyPattern();
                          break;
                      case 'perimeter':
                          this.generatePerimeterPattern();
                          break;
                      case 'vertices':
                          this.generateVerticesPattern();
                          break;
                  }
                  
                  this.updateStatistics();
              } catch (error) {
                  console.error('Error updating visualization:', error);
                  this.showError('Error generating pattern: ' + error.message);
              }
          }
          
          // Fixed Survey Pattern Generation
          generateSurveyPattern() {
              const coords = this.boundaryData.geometry.coordinates[0];
              const altitude = parseFloat(document.getElementById('altitude').value);
              const gridAngle = parseFloat(document.getElementById('grid-angle').value);
              const turnAroundDistance = parseFloat(document.getElementById('turn-around-distance').value);
              const spacing = this.calculateLineSpacing();

              if (!spacing){
                  console.log("unable to process line spacing.")
                  return
              }

              const turnWaypointsOnly = document.getElementById('turn-waypoints-only').checked;
              
              console.log('Generating survey pattern with params:', {
                  altitude, gridAngle, turnAroundDistance, spacing, turnWaypointsOnly
              });
              
              // Calculate survey grid with proper spacing
              const surveyLines = this.calculateSurveyGrid(coords, gridAngle, spacing, turnAroundDistance);
              this.waypoints = [];
              
              if (surveyLines.length === 0) {
                  console.warn('No survey lines generated');
                  return;
              }
              
              // Generate waypoints from survey lines
              let waypointId = 1;
              
              for (let i = 0; i < surveyLines.length; i++) {
                  const line = surveyLines[i];
                  
                  if (turnWaypointsOnly) {
                      // Only add start and end points of each line
                      if (line.length > 0) {
                          this.waypoints.push({
                              id: waypointId++,
                              lat: line[0][1],
                              lng: line[0][0],
                              alt: altitude,
                              type: 'survey_start'
                          });
                          
                          if (line.length > 1) {
                              this.waypoints.push({
                                  id: waypointId++,
                                  lat: line[line.length - 1][1],
                                  lng: line[line.length - 1][0],
                                  alt: altitude,
                                  type: 'survey_end'
                              });
                          }
                      }
                  } else {
                      // Add waypoints along each line with proper spacing
                      const lineSpacing = 10; // meters between waypoints on same line
                      const sampledLine = this.sampleLineString(line, lineSpacing);
                      
                      sampledLine.forEach(point => {
                          this.waypoints.push({
                              id: waypointId++,
                              lat: point[1],
                              lng: point[0],
                              alt: altitude,
                              type: 'survey'
                          });
                      });
                  }
              }
              
              console.log(`Generated ${this.waypoints.length} waypoints`);
              
              // Generate camera trigger points if enabled
              if (document.getElementById('camera-trigger').checked) {
                  this.generateCameraTriggerPoints();
              }
              
              this.displayWaypoints();
              this.displayFlightPath();
          }

         calculateLineSpacing() {
            this.validateAllInputs()
            if (this.validationErrors.size>0){
                return
            }
            // Fetch values from the DOM
            const imageWidthElement = document.getElementById('image-width');
            const imageHeightElement = document.getElementById('image-height');
            const sensorWidthElement = document.getElementById('sensor-width');
            const sensorHeightElement = document.getElementById('sensor-height');
            const focalLengthElement = document.getElementById('focal-length');
            const frontalOverlapElement = document.getElementById('frontal-overlap');
            const sideOverlapElement = document.getElementById('side-overlap');
            const flightAltitude = parseFloat(document.getElementById('altitude').value)
            // Validate DOM elements
            if (!imageWidthElement || !imageHeightElement || !sensorWidthElement || !sensorHeightElement || !focalLengthElement || !frontalOverlapElement || !sideOverlapElement) {
                console.error('One or more required elements are missing from the DOM');
                return;
            }

            // Parse values
            const imageWidth = parseFloat(imageWidthElement.value);       // px
            const imageHeight = parseFloat(imageHeightElement.value);     // px
            const sensorWidth = parseFloat(sensorWidthElement.value);     // mm
            const sensorHeight = parseFloat(sensorHeightElement.value);   // mm
            const focalLength = parseFloat(focalLengthElement.value);     // mm
            const frontalOverlap = parseFloat(frontalOverlapElement.value); // %
            const sideOverlap = parseFloat(sideOverlapElement.value);       // %

            // Validate numbers and ranges
            if (
                isNaN(imageWidth) || isNaN(imageHeight) ||
                isNaN(sensorWidth) || isNaN(sensorHeight) ||
                isNaN(focalLength) || isNaN(frontalOverlap) || isNaN(sideOverlap)
            ) {
                console.error('One or more values are not numeric');
                return;
            }
            if (imageWidth <= 0 || imageHeight <= 0 || sensorWidth <= 0 || sensorHeight <= 0 || focalLength <= 0) {
                console.error('Image and sensor dimensions, and focal length must be positive');
                return;
            }
            if (frontalOverlap < 0 || frontalOverlap >= 100 || sideOverlap < 0 || sideOverlap >= 100) {
                console.error('Overlap values must be between 0 (inclusive) and 100 (exclusive)');
                return;
            }
            if (isNaN(flightAltitude) || flightAltitude <= 0) {
                console.error('Flight altitude must be a positive number');
                return;
            }

            // Convert sensor size from mm to meters
            const sensorWidthM = sensorWidth / 1000;
            const sensorHeightM = sensorHeight / 1000;
            const focalLengthM = focalLength / 1000;

            // Ground width & height captured per image (meters)
            const groundWidth = (flightAltitude * sensorWidthM) / focalLengthM;
            const groundHeight = (flightAltitude * sensorHeightM) / focalLengthM;

            // Calculate effective line spacings
            // (1 - sideOverlap) or (1 - frontalOverlap) gives the non-overlapped part as fraction
            const sideSpacing = groundWidth * (1 - sideOverlap / 100);
            // const frontalSpacing = groundHeight * (1 - frontalOverlap / 100);
            return sideSpacing
            // return {
            //     sideLineSpacingMeters: sideSpacing,
            //     frontalLineSpacingMeters: frontalSpacing
            // };
        }

          
          // Improved survey grid calculation
          calculateSurveyGrid(coords, angle, spacing, turnAroundDistance) {
              const bounds = this.getPolygonBounds(coords);
              const lines = [];
              
              // Convert angle to radians
              const radians = (angle * Math.PI) / 180;
              const cos = Math.cos(radians);
              const sin = Math.sin(radians);
              
              // Calculate polygon center
              const centerLat = (bounds.minLat + bounds.maxLat) / 2;
              const centerLng = (bounds.minLng + bounds.maxLng) / 2;
              
              // Extend bounds to ensure full coverage
              const latRange = bounds.maxLat - bounds.minLat;
              const lngRange = bounds.maxLng - bounds.minLng;
              const maxDimension = Math.max(latRange, lngRange);
              
              const extendedBounds = {
                  minLat: centerLat - maxDimension,
                  maxLat: centerLat + maxDimension,
                  minLng: centerLng - maxDimension,
                  maxLng: centerLng + maxDimension
              };
              
              // Convert spacing from meters to degrees (approximation)
              const spacingDeg = spacing / 111000; // 1 degree ≈ 111km
              
              // Generate parallel lines
              const numLines = Math.ceil((extendedBounds.maxLat - extendedBounds.minLat) / spacingDeg);
              
              for (let i = 0; i <= numLines; i++) {
                  const y = extendedBounds.minLat + (i * spacingDeg);
                  
                  // Create line endpoints
                  const startX = extendedBounds.minLng;
                  const endX = extendedBounds.maxLng;
                  
                  // Rotate line around center
                  const lineStart = this.rotatePoint([startX, y], [centerLng, centerLat], radians);
                  const lineEnd = this.rotatePoint([endX, y], [centerLng, centerLat], radians);
                  
                  // Find intersections with polygon
                  const intersections = this.getLinePolygonIntersections([lineStart, lineEnd], coords);
                  
                  if (intersections.length >= 2) {
                      // Sort intersections by distance along line
                      intersections.sort((a, b) => {
                          const distA = this.calculateDistance(lineStart[1], lineStart[0], a[1], a[0]);
                          const distB = this.calculateDistance(lineStart[1], lineStart[0], b[1], b[0]);
                          return distA - distB;
                      });
                      
                      // Create line segments from intersection pairs
                      for (let j = 0; j < intersections.length; j += 2) {
                          if (j + 1 < intersections.length) {
                              let segmentStart = intersections[j];
                              let segmentEnd = intersections[j + 1];
                              
                              // Reverse every other line for efficient survey pattern
                              if (i % 2 === 1) {
                                  [segmentStart, segmentEnd] = [segmentEnd, segmentStart];
                              }
                              
                              lines.push([segmentStart, segmentEnd]);
                          }
                      }
                  }
              }
              
              return lines;
          }
          
          // Helper functions for survey grid calculation
          rotatePoint(point, center, angle) {
              const cos = Math.cos(angle);
              const sin = Math.sin(angle);
              
              const dx = point[0] - center[0];
              const dy = point[1] - center[1];
              
              return [
                  center[0] + dx * cos - dy * sin,
                  center[1] + dx * sin + dy * cos
              ];
          }
          
          getLinePolygonIntersections(line, polygon) {
              const intersections = [];
              const [lineStart, lineEnd] = line;
              
              for (let i = 0; i < polygon.length - 1; i++) {
                  const segStart = polygon[i];
                  const segEnd = polygon[i + 1];
                  
                  const intersection = this.getLineIntersection(lineStart, lineEnd, segStart, segEnd);
                  if (intersection) {
                      intersections.push(intersection);
                  }
              }
              
              return intersections;
          }
          
          getLineIntersection(line1Start, line1End, line2Start, line2End) {
              const x1 = line1Start[0], y1 = line1Start[1];
              const x2 = line1End[0], y2 = line1End[1];
              const x3 = line2Start[0], y3 = line2Start[1];
              const x4 = line2End[0], y4 = line2End[1];
              
              const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
              if (Math.abs(denom) < 1e-10) return null; // Lines are parallel
              
              const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
              const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
              
              if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
                  return [
                      x1 + t * (x2 - x1),
                      y1 + t * (y2 - y1)
                  ];
              }
              
              return null;
          }
          
          sampleLineString(line, spacingMeters) {
              if (line.length < 2) return line;
              
              const sampledPoints = [line[0]]; // Always include start point
              let currentDistance = 0;
              const spacingDeg = spacingMeters / 111000; // Convert to degrees
              
              for (let i = 1; i < line.length; i++) {
                  const segmentLength = this.calculateDistance(line[i-1][1], line[i-1][0], line[i][1], line[i][0]);
                  
                  while (currentDistance + spacingDeg < segmentLength) {
                      currentDistance += spacingDeg;
                      const ratio = currentDistance / segmentLength;
                      
                      const interpolatedPoint = [
                          line[i-1][0] + (line[i][0] - line[i-1][0]) * ratio,
                          line[i-1][1] + (line[i][1] - line[i-1][1]) * ratio
                      ];
                      
                      sampledPoints.push(interpolatedPoint);
                  }
                  
                  currentDistance = 0; // Reset for next segment
              }
              
              sampledPoints.push(line[line.length - 1]); // Always include end point
              return sampledPoints;
          }
          
          generatePerimeterPattern() {
              const coords = this.boundaryData.geometry.coordinates[0];
              const altitude = parseFloat(document.getElementById('altitude').value);
              
              this.waypoints = coords.slice(0, -1).map((coord, index) => ({
                  id: index + 1,
                  lat: coord[1],
                  lng: coord[0],
                  alt: altitude,
                  type: 'perimeter'
              }));
              
              console.log(`Generated ${this.waypoints.length} perimeter waypoints`);
              
              this.displayWaypoints();
              this.displayFlightPath();
          }
          
          generateVerticesPattern() {
              const coords = this.boundaryData.geometry.coordinates[0];
              const altitude = parseFloat(document.getElementById('altitude').value);
              
              this.waypoints = coords.slice(0, -1).map((coord, index) => ({
                  id: index + 1,
                  lat: coord[1],
                  lng: coord[0],
                  alt: altitude,
                  type: 'vertex'
              }));
              
              console.log(`Generated ${this.waypoints.length} vertex waypoints`);
              
              this.displayWaypoints();
          }
          
          // Fixed camera trigger point generation
        generateCameraTriggerPoints() {
            if (this.waypoints.length < 2) return;
            
            const triggerDistance = this.calculateTriggerDistance();
            if (triggerDistance <= 0) {
                console.warn('Invalid trigger distance calculated');
                return;
            }
            
            this.cameraPoints = [];
            let triggerId = 1;

            // At every waypoint, reset currentDistance, so triggers are always measured from there
            for (let i = 1; i < this.waypoints.length; i++) {
                const prev = this.waypoints[i - 1];
                const curr = this.waypoints[i];
                const segmentDistance = this.calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);

                let distanceAlongSegment = 0;
                let currentDistance = 0;
                
                // Add a camera trigger point at the waypoint itself (reset point)
                this.cameraPoints.push({
                    id: triggerId++,
                    lat: prev.lat,
                    lng: prev.lng,
                    alt: prev.alt
                });

                // Place regular triggers measured from the start of this segment
                while (currentDistance + triggerDistance <= segmentDistance) {
                    currentDistance += triggerDistance;
                    distanceAlongSegment = currentDistance;

                    if (distanceAlongSegment <= segmentDistance) {
                        const ratio = distanceAlongSegment / segmentDistance;

                        const lat = prev.lat + (curr.lat - prev.lat) * ratio;
                        const lng = prev.lng + (curr.lng - prev.lng) * ratio;

                        this.cameraPoints.push({
                            id: triggerId++,
                            lat: lat,
                            lng: lng,
                            alt: curr.alt
                        });
                    }
                }
                // This ends at the last trigger before the next waypoint
                // Next loop will start with the next waypoint, with trigger distance reset
            }
            // Optionally, add a trigger at the last waypoint
            const last = this.waypoints[this.waypoints.length - 1];
            this.cameraPoints.push({
                id: triggerId++,
                lat: last.lat,
                lng: last.lng,
                alt: last.alt
            });

            console.log(`Generated ${this.cameraPoints.length} camera trigger points (reset at each waypoint)`);
            this.displayCameraTriggers();
        }

          
          // Fixed trigger distance calculation
          calculateTriggerDistance() {
              const altitude = parseFloat(document.getElementById('altitude').value);
              const sensorWidth = parseFloat(document.getElementById('sensor-width').value);
              const focalLength = parseFloat(document.getElementById('focal-length').value);
              const frontalOverlap = parseFloat(document.getElementById('frontal-overlap').value) / 100;
              const minTriggerInterval = parseFloat(document.getElementById('min-trigger-interval').value);
              const cruiseSpeed = parseFloat(document.getElementById('cruise-speed').value);
              
              // Validate inputs
              if (sensorWidth <= 0 || focalLength <= 0 || altitude <= 0) {
                  console.warn('Invalid camera parameters for trigger calculation');
                  return 50; // Default fallback
              }
              
              // Calculate ground sample distance (GSD) in meters per pixel
              const gsd = (altitude * sensorWidth) / (focalLength * 1000); // Convert mm to m
              
              // Calculate image width coverage on ground
              const imageWidth = parseFloat(document.getElementById('image-width').value);
              const groundWidth = gsd * imageWidth;
              
              // Calculate trigger distance based on overlap
              const triggerDistance = groundWidth * (1 - frontalOverlap);
              
              // Ensure minimum trigger interval is respected
              const minDistance = cruiseSpeed * minTriggerInterval;
              
              return Math.max(triggerDistance, minDistance);
          }
          
          displayWaypoints() {
              this.waypointLayer.clearLayers();
              
              this.waypoints.forEach((waypoint, index) => {
                  const marker = L.marker([waypoint.lat, waypoint.lng], {
                      icon: this.createWaypointIcon(waypoint.id)
                  }).addTo(this.waypointLayer);
                  
                  marker.bindPopup(`
                      <div>
                          <h4>Waypoint ${waypoint.id}</h4>
                          <p><strong>Lat:</strong> ${waypoint.lat.toFixed(6)}</p>
                          <p><strong>Lng:</strong> ${waypoint.lng.toFixed(6)}</p>
                          <p><strong>Alt:</strong> ${waypoint.alt} m</p>
                          <p><strong>Type:</strong> ${waypoint.type}</p>
                      </div>
                  `);
              });
              
              // Add home position marker
              if (this.waypoints.length > 0) {
                  const home = this.waypoints[0];
                  L.marker([home.lat, home.lng], {
                      icon: this.createHomeIcon()
                  }).addTo(this.waypointLayer);
              }
          }
          
          displayFlightPath() {
              this.pathLayer.clearLayers();
              
              if (this.waypoints.length > 1) {
                  const path = this.waypoints.map(wp => [wp.lat, wp.lng]);
                  L.polyline(path, {
                      color: '#1FB8CD',
                      weight: 3,
                      opacity: 0.8
                  }).addTo(this.pathLayer);
              }
          }
          
          displayCameraTriggers() {
              this.cameraLayer.clearLayers();
              
              this.cameraPoints.forEach(point => {
                  L.marker([point.lat, point.lng], {
                      icon: this.createCameraIcon()
                  }).addTo(this.cameraLayer);
              });
          }
          
          createWaypointIcon(number) {
              return L.divIcon({
                  className: 'waypoint-marker',
                  html: `<div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">${number}</div>`,
                  iconSize: [24, 24],
                  iconAnchor: [12, 12]
              });
          }
          
          createHomeIcon() {
              return L.divIcon({
                  className: 'home-marker',
                  html: '<div style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">H</div>',
                  iconSize: [20, 20],
                  iconAnchor: [10, 10]
              });
          }
          
          createCameraIcon() {
              return L.divIcon({
                  className: 'camera-marker',
                  html: '<div style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">📷</div>',
                  iconSize: [16, 16],
                  iconAnchor: [8, 8]
              });
          }
          
          clearLayers() {
              this.waypointLayer.clearLayers();
              this.pathLayer.clearLayers();
              this.cameraLayer.clearLayers();
              this.cameraPoints = [];
          }
          
          updateStatistics() {
              const stats = this.calculateStatistics();
              
              document.getElementById('stat-waypoints').textContent = stats.waypoints;
              document.getElementById('stat-distance').textContent = `${stats.distance} m`;
              document.getElementById('stat-time').textContent = `${stats.flightTime} min`;
              document.getElementById('stat-shots').textContent = stats.cameraShots;
              document.getElementById('stat-area').textContent = `${stats.area} m²`;
          }
          
          calculateStatistics() {
              const waypoints = this.waypoints.length;
              const distance = Math.round(this.calculateTotalDistance());
              const speed = parseFloat(document.getElementById('cruise-speed').value) || 15;
              const flightTime = Math.round((distance / speed) / 60 * 10) / 10; // Round to 1 decimal
              const cameraShots = this.cameraPoints.length;
              const area = this.boundaryData ? Math.round(this.calculatePolygonArea(this.boundaryData.geometry.coordinates[0])) : 0;
              
              return {
                  waypoints,
                  distance,
                  flightTime,
                  cameraShots,
                  area
              };
          }
          
          calculateTotalDistance() {
              let total = 0;
              for (let i = 1; i < this.waypoints.length; i++) {
                  const prev = this.waypoints[i - 1];
                  const curr = this.waypoints[i];
                  total += this.calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
              }
              return total;
          }
          
          // Progress tracking for plan generation
          showProgress(progress) {
              const progressBar = document.getElementById('progress-bar');
              const progressFill = document.getElementById('progress-fill');
              
              progressBar.classList.remove('hidden');
              progressFill.style.width = `${progress}%`;
              
              if (progress >= 100) {
                  setTimeout(() => {
                      progressBar.classList.add('hidden');
                      progressFill.style.width = '0%';
                  }, 500);
              }
          }
          
          async generatePlan() {
              if (this.validationErrors.size > 0) {
                  this.showError('Please fix validation errors before generating plan');
                  return;
              }
              
              if (!this.boundaryData) {
                  this.showError('Please load boundary data first');
                  return;
              }
              
              if (this.waypoints.length === 0) {
                  this.showError('No waypoints generated. Please ensure boundary data is loaded and pattern is configured');
                  return;
              }
              
              this.showLoading(true);
              this.updatePlanStatus('Generating...');
              
              try {
                  // Simulate progress
                  this.showProgress(20);
                  await this.delay(200);
                  
                  this.currentPlan = this.createQGCPlan();
                  this.showProgress(60);
                  await this.delay(200);
                  
                  this.updatePlanPreview();
                  this.showProgress(80);
                  await this.delay(200);
                  
                  this.enableExportButtons();
                  this.updatePlanStatus('Valid');
                  this.showProgress(100);
                  
                  console.log('Plan generated successfully:', this.currentPlan);
                  
              } catch (error) {
                  console.error('Plan generation failed:', error);
                  this.showError('Plan generation failed: ' + error.message);
                  this.updatePlanStatus('Error');
              } finally {
                  this.showLoading(false);
              }
          }
          
          delay(ms) {
              return new Promise(resolve => setTimeout(resolve, ms));
          }
          
          createQGCPlan() {
              const vehicleType = parseInt(document.getElementById('vehicle-type').value);
              const firmwareType = parseInt(document.getElementById('firmware-type').value);
              const cruiseSpeed = parseFloat(document.getElementById('cruise-speed').value) || 15;
              const hoverSpeed = parseFloat(document.getElementById('hover-speed').value) || 5;
              
              if (this.waypoints.length === 0) {
                  throw new Error('No waypoints available for plan generation');
              }
              
              const home = this.waypoints[0];
              const plannedHomePosition = [home.lat, home.lng, home.alt];
              
              const plan = {
                  fileType: "Plan",
                  geoFence: {
                      circles: [],
                      polygons: [],
                      version: 2
                  },
                  groundStation: "QGroundControl",
                  mission: {
                      cruiseSpeed: cruiseSpeed,
                      firmwareType: firmwareType,
                      globalPlanAltitudeMode: parseInt(document.getElementById('altitude-mode').value),
                      hoverSpeed: hoverSpeed,
                      items: this.generateMissionItems(),
                      plannedHomePosition: plannedHomePosition,
                      vehicleType: vehicleType,
                      version: 2
                  },
                  rallyPoints: {
                      points: [],
                      version: 2
                  },
                  version: 1
              };
              
              return plan;
          }
          
          generateMissionItems() {
              const items = [];
              let sequence = 0;
              
              // Validate required parameters
              const altitude = parseFloat(document.getElementById('altitude').value);
              const altitudeMode = parseInt(document.getElementById('altitude-mode').value);
              let triggerDistance;
              const camEnabled = document.getElementById('camera-trigger').checked
              if (isNaN(altitude) || altitude <= 0) {
                  throw new Error('Invalid altitude value');
              }
              // Calculate centroid of polygon
              const centroid = this.getPolygonCentroid(this.boundaryData.geometry.coordinates[0]);
              
              // Add takeoff command
              items.push({
                  AMSLAltAboveTerrain: null,
                  Altitude: altitude,
                  AltitudeMode: altitudeMode,
                  autoContinue: true,
                  command: this.MAV_CMD.NAV_TAKEOFF,
                  doJumpId: sequence++,
                  frame: 3,
                  params: [0, 0, 0, 0, centroid[0], centroid[1], altitude],
                  type: "SimpleItem"
              });
              
              // Add camera trigger command if enabled
              if (document.getElementById('camera-trigger').checked) {
                  triggerDistance = this.calculateTriggerDistance();
                  if (triggerDistance > 0) {
                      items.push({
                          AMSLAltAboveTerrain: null,
                          Altitude: altitude,
                          AltitudeMode: altitudeMode,
                          autoContinue: true,
                          command: this.MAV_CMD.DO_SET_CAM_TRIGG_DIST,
                          doJumpId: sequence++,
                          frame: 2,
                          params: [triggerDistance, 0, 1, 0, 0, 0, 0],
                          type: "SimpleItem"
                      });
                  }
              }
              
              // Add waypoint commands
              this.waypoints.forEach((waypoint, index) => {
                  if (isNaN(waypoint.lat) || isNaN(waypoint.lng) || isNaN(waypoint.alt)) {
                      throw new Error(`Invalid waypoint coordinates at index ${index}`);
                  }
                  if (camEnabled) {
                        // — Reset trigger distance to 0 at *arrival* to this waypoint
                        items.push({
                            AMSLAltAboveTerrain: null,
                            Altitude: wp.alt,
                            AltitudeMode: altitudeMode,
                            autoContinue: true,
                            command: this.MAV_CMD.DO_SET_CAM_TRIGG_DIST,
                            doJumpId: sequence++,
                            frame: 2,
                            params: [0, 0, 1, 0, 0, 0, 0],
                            type: "SimpleItem"
                        });
                    }
                  items.push({
                      AMSLAltAboveTerrain: null,
                      Altitude: waypoint.alt,
                      AltitudeMode: altitudeMode,
                      autoContinue: true,
                      command: this.MAV_CMD.NAV_WAYPOINT,
                      doJumpId: sequence++,
                      frame: 3,
                      params: [0, 0, 0, 0, waypoint.lat, waypoint.lng, waypoint.alt],
                      type: "SimpleItem"
                  });
                  if (camEnabled) {
                        // — Re-enable trigger distance for the *next* line segment
                        items.push({
                            AMSLAltAboveTerrain: null,
                            Altitude: wp.alt,
                            AltitudeMode: altitudeMode,
                            autoContinue: true,
                            command: this.MAV_CMD.DO_SET_CAM_TRIGG_DIST,
                            doJumpId: sequence++,
                            frame: 2,
                            params: [triggerDistance, 0, 1, 0, 0, 0, 0],
                            type: "SimpleItem"
                        });
                    }
              });
              
              // Add RTL command
              items.push({
                  AMSLAltAboveTerrain: null,
                  Altitude: 0,
                  AltitudeMode: altitudeMode,
                  autoContinue: true,
                  command: this.MAV_CMD.NAV_RTL,
                  doJumpId: sequence++,
                  frame: 2,
                  params: [0, 0, 0, 0, 0, 0, 0],
                  type: "SimpleItem"
              });
              
              return items;
          }
          
          updatePlanPreview() {
              const preview = document.getElementById('plan-preview');
              if (this.currentPlan) {
                  preview.textContent = JSON.stringify(this.currentPlan, null, 2);
              } else {
                  preview.textContent = 'No plan generated';
              }
          }
          
          updatePlanStatus(status) {
              const statusElement = document.getElementById('plan-status');
              let statusClass = 'status--info';
              
              switch (status) {
                  case 'Valid':
                      statusClass = 'status--success';
                      break;
                  case 'Error':
                      statusClass = 'status--error';
                      break;
                  case 'Generating...':
                      statusClass = 'status--warning';
                      break;
              }
              
              statusElement.innerHTML = `<span class="status ${statusClass}">${status}</span>`;
          }
          
          enableExportButtons() {
              const buttons = ['export-plan', 'export-json', 'export-csv'];
              buttons.forEach(id => {
                  document.getElementById(id).disabled = false;
              });
          }
          
          exportPlan() {
              if (!this.currentPlan) {
                  this.showError('No plan available to export');
                  return;
              }
              
              try {
                  const blob = new Blob([JSON.stringify(this.currentPlan, null, 2)], {
                      type: 'application/json'
                  });
                  this.downloadBlob(blob, 'mission.plan');
              } catch (error) {
                  this.showError('Failed to export plan: ' + error.message);
              }
          }
          
          exportJSON() {
              if (!this.currentPlan) {
                  this.showError('No plan available to export');
                  return;
              }
              
              try {
                  const blob = new Blob([JSON.stringify(this.currentPlan, null, 2)], {
                      type: 'application/json'
                  });
                  this.downloadBlob(blob, 'mission.json');
              } catch (error) {
                  this.showError('Failed to export JSON: ' + error.message);
              }
          }
          
          exportCSV() {
              if (this.waypoints.length === 0) {
                  this.showError('No waypoints available to export');
                  return;
              }
              
              try {
                  const headers = ['ID', 'Latitude', 'Longitude', 'Altitude', 'Type'];
                  const rows = this.waypoints.map(wp => [
                      wp.id,
                      wp.lat.toFixed(6),
                      wp.lng.toFixed(6),
                      wp.alt,
                      wp.type
                  ]);
                  
                  const csvContent = [headers, ...rows]
                      .map(row => row.join(','))
                      .join('\n');
                  
                  const blob = new Blob([csvContent], { type: 'text/csv' });
                  this.downloadBlob(blob, 'waypoints.csv');
              } catch (error) {
                  this.showError('Failed to export CSV: ' + error.message);
              }
          }
          
          downloadBlob(blob, filename) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = filename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
          }
          
          showLoading(show) {
              const loading = document.getElementById('loading');
              if (show) {
                  loading.classList.remove('hidden');
              } else {
                  loading.classList.add('hidden');
              }
          }
          
          // Enhanced error handling
          showError(message) {
              console.error(message);
              
              // Remove any existing error toasts
              const existingToasts = document.querySelectorAll('.error-toast');
              existingToasts.forEach(toast => toast.remove());
              
              // Create new error toast
              const toast = document.createElement('div');
              toast.className = 'error-toast';
              toast.textContent = message;
              
              document.body.appendChild(toast);
              
              // Auto remove after 5 seconds
              setTimeout(() => {
                  if (toast.parentNode) {
                      toast.parentNode.removeChild(toast);
                  }
              }, 5000);
              
              // Allow manual close on click
              toast.addEventListener('click', () => {
                  if (toast.parentNode) {
                      toast.parentNode.removeChild(toast);
                  }
              });
          }
          
          // Utility functions (fixed implementations)
          calculateDistance(lat1, lng1, lat2, lng2) {
              const R = 6371000; // Earth's radius in meters
              const dLat = this.toRadians(lat2 - lat1);
              const dLng = this.toRadians(lng2 - lng1);
              
              const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                      Math.sin(dLng/2) * Math.sin(dLng/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              
              return R * c;
          }
          
          toRadians(degrees) {
              return degrees * (Math.PI / 180);
          }
          
          // Fixed polygon area calculation
          calculatePolygonArea(coordinates) {
              if (!Array.isArray(coordinates) || coordinates.length < 3) {
                  return 0;
              }
              
              let area = 0;
              const numPoints = coordinates.length - 1; // Exclude closing point
              
              // Use the shoelace formula for polygon area
              for (let i = 0; i < numPoints; i++) {
                  const j = (i + 1) % numPoints;
                  area += coordinates[i][0] * coordinates[j][1];
                  area -= coordinates[j][0] * coordinates[i][1];
              }
              
              area = Math.abs(area) / 2.0;
              
              // Convert from square degrees to square meters
              // Use approximate conversion at polygon centroid
              const centroid = this.getPolygonCentroid(coordinates);
              const metersPerDegreeLat = 111000;
              const metersPerDegreeLng = 111000 * Math.cos(this.toRadians(centroid.lat));
              
              return area * metersPerDegreeLat * metersPerDegreeLng;
          }
          
          getPolygonCentroid(coordinates) {
              let lat = 0, lng = 0;
              const numPoints = coordinates.length - 1; // Exclude closing point
              
              for (let i = 0; i < numPoints; i++) {
                  lat += coordinates[i][1];
                  lng += coordinates[i][0];
              }
              
              return {
                  lat: lat / numPoints,
                  lng: lng / numPoints
              };
          }
          
          getPolygonBounds(coordinates) {
              let minLat = Infinity, maxLat = -Infinity;
              let minLng = Infinity, maxLng = -Infinity;
              
              coordinates.forEach(coord => {
                  minLat = Math.min(minLat, coord[1]);
                  maxLat = Math.max(maxLat, coord[1]);
                  minLng = Math.min(minLng, coord[0]);
                  maxLng = Math.max(maxLng, coord[0]);
              });
              
              return { minLat, maxLat, minLng, maxLng };
          }
          
          pointInPolygon(point, polygon) {
              let inside = false;
              const x = point[0], y = point[1];
              
              for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                  const xi = polygon[i][0], yi = polygon[i][1];
                  const xj = polygon[j][0], yj = polygon[j][1];
                  
                  if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                      inside = !inside;
                  }
              }
              
              return inside;
          }
          
          // Cleanup method
          destroy() {
              // Clear timeouts
              if (this.debounceTimeout) {
                  clearTimeout(this.debounceTimeout);
              }
              
              // Clear map
              if (this.map) {
                  this.map.remove();
              }
              
              // Remove event listeners (if needed for SPA)
              // This would be implemented if the component needs to be destroyed
          }
      }

      // Initialize the application when DOM is loaded
      document.addEventListener('DOMContentLoaded', () => {
          try {
              window.qgcApp = new QGCPlanGenerator();
              console.log('QGroundControl Plan Generator initialized successfully');
          } catch (error) {
              console.error('Failed to initialize QGroundControl Plan Generator:', error);
              
              // Show error message to user
              const errorDiv = document.createElement('div');
              errorDiv.className = 'error-toast';
              errorDiv.textContent = 'Failed to initialize application: ' + error.message;
              document.body.appendChild(errorDiv);
          }
      });