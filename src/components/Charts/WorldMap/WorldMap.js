import "./Style.css";
const { useState, useEffect, useRef, createContext } = React;
const svgMap = window.svgMap;
import { countryCodes, countryCoordinates } from "./countryCodes.js";

function colorCalulator(value) {
   const baseColor = "#c09f53";
   const maxColor = "#c09f53";
   const minColor = "#ddd29b";

   // Calculate the color based on the value, the higher the value the darker the color taken from the baseColor

   // convert the base hex color to rgb
   const base = {
      r: parseInt(baseColor.substring(1, 3), 16),
      g: parseInt(baseColor.substring(3, 5), 16),
      b: parseInt(baseColor.substring(5, 7), 16)
   };

   // calculate the color opacity based on the value and the minColor value
   const opacity = value / 100 * (1 - 0.1) + 0.46;

   return `rgba(${base.r}, ${base.g}, ${base.b}, ${opacity})`;

}

export default function Map(props) {
   const data = props.data;
   const total = data.total;
   const countries = data.Countries;

   if (countries != null) {

      const newArray = countries.map((country, key) => {
         if (country.country != "Unknown") {
            /* console.log(country); */
            const name = country.country;
            const code = countryCodes[name];
            return {
               [code]: {
                  date: data.date ? data.date : "No data",
                  total: country.num.total,
                  accepted: country.accepted,
                  rejected: country.declined,
                  functional: country.functional,
                  statistics: country.statics,
                  marketing: country.marketing,
                  color: colorCalulator(country.num.total)
               }
            }
         }
      });

      const mapCountries = Object.assign({}, ...newArray);

      useEffect(() => {
         document.getElementById("svgMap").innerHTML = "";
         let zoomLevel = 1.2;
         let center = [0, 0];

         // Zoom into center the area of the map where the data is
         if (countries.length > 0) {
            const min = Math.min(...countries.map(country => country.num.total));
            const max = Math.max(...countries.map(country => country.num.total));

            if (max - min > 3000) {
               zoomLevel = 1.5;

               const lat = countries.map(country => {
                  // Find the country code of the max value
                  const code = countryCodes[country.country];
                  const coords = countryCoordinates[code];
                  return coords ? [coords.lat, coords.lng] : undefined;
               }).filter((lat) => {
                  return lat !== undefined
               });

               const lng = countries.map(country => {
                  const code = countryCodes[country.country];
                  const coords = countryCoordinates[code];
                  return coords ? [coords.lat, coords.lng] : undefined;
               }).filter((lng) => {
                  return lng !== undefined;
               });

               const latMin = Math.min(...lat);
               const latMax = Math.max(...lat);

               const lngMin = Math.min(...lng);
               const lngMax = Math.max(...lng);

               center = [(latMax + latMin) / 2, (lngMax + lngMin) / 2];
            }
         }


         new svgMap({
            targetElementID: 'svgMap',

            data: {
               data: {
                  total: {
                     name: 'Total Interactions',
                     format: '{0}',
                     thousandSeparator: '.',
                     thresholdMax: 800,
                     thresholdMin: 10
                  },
                  accepted: {
                     name: 'Accepted Consents',
                     format: '{0} %',
                     thousandSeparator: '.',
                     thresholdMax: 800,
                     thresholdMin: 10
                  },
                  rejected: {
                     name: 'Rejected Consents',
                     format: '{0} %',
                     thousandSeparator: '.',
                     thresholdMax: 800,
                     thresholdMin: 10
                  },
                  functional: {
                     name: 'Functional Consents',
                     format: '{0} %',
                     thousandSeparator: '.',
                     thresholdMax: 800,
                     thresholdMin: 10
                  },
                  statistics: {
                     name: 'Statistics Consents',
                     format: '{0} %',
                     thousandSeparator: '.',
                     thresholdMax: 800,
                     thresholdMin: 10
                  },
                  marketing: {
                     name: 'Marketing Consents',
                     format: '{0} %',
                     thousandSeparator: '.',
                     thresholdMax: 800,
                     thresholdMin: 10
                  }
               },
               applyData: 'total',
               values: mapCountries,
            },
            initialZoom: zoomLevel,
            initialLocation: center,
         });
      }, [data])
   }

   return (
      <>
         <div className="grid-container grid-3">
            <div id="svgMap"></div>
         </div>
         <div className="top-countries">
            <div className="grid-container grid-2">
               <p>Contry</p>
               <p style={{ textAlign: "right" }}>Active users</p>
            </div>
            {
               (countries) ? countries.sort((a, b) => {
                  return b.num.total - a.num.total;
               }
               ).map((country, key) => {
                  return (
                     <div key={key}>
                        <div className="grid-container grid-2">
                           <p>{country.country}</p>
                           <p style={{
                              textAlign: "right",
                           }}>{country.num.total.toLocaleString("de-DE")}</p>
                        </div>
                        <div style={{
                           width: "100%",
                           height: "2px",
                           backgroundColor: "#c4c4c4",
                           position: "relative",
                           overflow: "hidden",
                        }}>
                           <div
                              style={{
                                 width: country.num.total / total * 100 + "%",
                                 height: "2px",
                                 position: "absolute",
                                 top: "0",
                                 left: "0",
                                 backgroundColor: "rgb(222, 189, 113)",
                              }}
                           ></div>
                        </div>
                        {/* <div className="grid-container grid-2">
                           <section>
                              <p>Accepted</p>
                              <div style={{
                                 width: "100%",
                                 height: "2px",
                                 backgroundColor: "#c4c4c4",
                                 position: "relative",
                                 overflow: "hidden",
                              }}>
                                 <div
                                    style={{
                                       width: country.accepted + "%",
                                       height: "2px",
                                       position: "absolute",
                                       top: "0",
                                       left: "0",
                                       backgroundColor: "rgb(222, 189, 113)",
                                    }}
                                 ></div>
                              </div>
                           </section>
                           <section>
                              <p>Rejected</p>
                              <div style={{
                                 width: "100%",
                                 height: "2px",
                                 backgroundColor: "#c4c4c4",
                                 position: "relative",
                                 overflow: "hidden",
                              }}>
                                 <div
                                    style={{
                                       width: country.declined + "%",
                                       height: "2px",
                                       position: "absolute",
                                       top: "0",
                                       left: "0",
                                       backgroundColor: "rgb(222, 189, 113)",
                                    }}
                                 ></div>
                              </div>
                           </section>
                           <section>
                              <p>Functional</p>
                              <div style={{
                                 width: "100%",
                                 height: "2px",
                                 backgroundColor: "#c4c4c4",
                                 position: "relative",
                                 overflow: "hidden",
                              }}>
                                 <div
                                    style={{
                                       width: country.functional + "%",
                                       height: "2px",
                                       position: "absolute",
                                       top: "0",
                                       left: "0",
                                       backgroundColor: "rgb(222, 189, 113)",
                                    }}
                                 ></div>
                              </div>
                           </section>
                           <section>
                              <p>Statistics</p>
                              <div style={{
                                 width: "100%",
                                 height: "2px",
                                 backgroundColor: "#c4c4c4",
                                 position: "relative",
                                 overflow: "hidden",
                              }}>
                                 <div
                                    style={{
                                       width: country.statics + "%",
                                       height: "2px",
                                       position: "absolute",
                                       top: "0",
                                       left: "0",
                                       backgroundColor: "rgb(222, 189, 113)",
                                    }}
                                 ></div>
                              </div>
                           </section>
                           <section>
                              <p>Marketing</p>
                              <div style={{
                                 width: "100%",
                                 height: "2px",
                                 backgroundColor: "#c4c4c4",
                                 position: "relative",
                                 overflow: "hidden",
                              }}>
                                 <div
                                    style={{
                                       width: country.marketing + "%",
                                       height: "2px",
                                       position: "absolute",
                                       top: "0",
                                       left: "0",
                                       backgroundColor: "rgb(222, 189, 113)",
                                    }}
                                 ></div>
                              </div>
                           </section>
                        </div> */}
                     </div>
                  )
               }).slice(0, 7) : null
            }
         </div>
      </>
   )
}