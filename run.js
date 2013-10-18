var https = require("https");
var queryString = require("querystring");
var strftime = require("strftime");
var fs = require("fs");
var xml2js = require("xml2js");

/**
 * @type {{togglApiKey: string, clockanApiKey: string, startDate: string, endDate: string}}
 */
var config = JSON.parse(fs.readFileSync(__dirname + "/config.json"));
var togglApiKey = config.togglApiKey;
var clockanApiKey = config.clockanApiKey;
var startDate = config.startDate;
var endDate = config.endDate;

var userAgent = "VaclavSir/ClockanToggl";

/**
 * report[project][day][description] = {duration: hours, ids: [1, 2, 3]}
 *
 * @typedef {Object.<string, Object.<string, Object.<string, {duration: number, ids: Array<number>}>>>}
 */
var GroupedReport;

/**
 * @param togglApiKey {string}
 * @param startDate {string}
 * @param endDate {string}
 * @param callback {function(GroupedReport, GroupedReport)}
 */
var getTogglReport = function (togglApiKey, startDate, endDate, callback) {
  var togglAuthorizationHeader = "Basic " + new Buffer(togglApiKey + ":api_token").toString("base64");
  https.get(
    {
      "host": "toggl.com",
      "path": "/api/v8/workspaces?" + queryString.stringify({
        "user_agent": userAgent
      }),
      "headers": {
        "Authorization": togglAuthorizationHeader
      }
    }, function (/**IncomingMessage*/ res) {
      var data = "";
      res.on("data", function (/**Buffer*/ chunk) {
        data += chunk;
      });
      res.on("end", function () {
        /**
         * Function to process a single workspace and eventually call itself to
         * process more pages, if the result is paginated.
         *
         * @param workspace {{id: number}}
         * @param page {?number}
         */
        var processWorkspace = function (workspace, page) {
          page = page || 1;
          https.get(
            {
              "host": "www.toggl.com",
              "path": "/reports/api/v2/details?" + queryString.stringify({
                "workspace_id": workspace.id,
                "since": startDate,
                "until": endDate,
                "page": page,
                "user_agent": userAgent
              }),
              "headers": {
                "Authorization": togglAuthorizationHeader
              }
            }, function (/**IncomingMessage*/ res) {
              var data = "";
              res.on("data", function (/**Buffer*/ chunk) {
                data += chunk
              });
              res.on("end", function () {
                /**
                 * @typedef {{
               *  id: number,
               *  description: string,
               *  start: string,
               *  dur: number,
               *  project: string,
               *  tags: Array<string>
               * }}
                 */
                var TimeEntry;
                /**
                 * @type {{
               *  total_count: number,
               *  per_page: number,
               *  data: Array<TimeEntry>
               * }}
                 */
                var report = JSON.parse(data.toString());
                var reportedTimes = {};
                var unreportedTimes = {};
                report.data.forEach(function (/**TimeEntry*/ entry) {
                  var entryDate = new Date(entry.start);
                  var day = strftime("%F", entryDate);
                  var properReport = (entry.tags.indexOf("reported") === -1) ? unreportedTimes : reportedTimes;
                  properReport[entry.project] = properReport[entry.project] || {};
                  properReport[entry.project][day] = properReport[entry.project][day] || {};
                  properReport[entry.project][day][entry.description] = properReport[entry.project][day][entry.description] || {duration: 0, ids: []};
                  properReport[entry.project][day][entry.description].duration += entry.dur / 3600000;
                  properReport[entry.project][day][entry.description].ids.push(entry.id);
                });
                callback(unreportedTimes, reportedTimes);
                if (report.total_count > (report.per_page * page)) {
                  processWorkspace(workspace, page + 1);
                }
              })
            }
          );
        };
        var workspacesData = /**Array*/ JSON.parse(data.toString());
        workspacesData.forEach(processWorkspace)
      })
    }
  );
};


/**
 * @param clockanApiKey {string}
 * @param callback {function(Object.<string, number>)}
 */
var getClockanProjects = function (clockanApiKey, callback) {
  var clockanAuthorizationHeader = "Basic " + new Buffer(clockanApiKey + ":x").toString("base64");
  /**
   * clockanProjects['projectName'] = 123456
   *
   * @type {Object.<string, number>}
   */
  var clockanProjects = {};
  https.get({
    "host": "www.clockan.com",
    "path": "/projects.xml",
    "headers": {
      "Authorization": clockanAuthorizationHeader,
      "Accept": "application/xml",
      "User-Agent": userAgent
    }
  }, function (/**IncomingMessage*/ res) {
    var data = "";
    res.on("data", function (/**Buffer*/ chunk) {
      data += chunk;
    });
    res.on("end", function () {
      xml2js.parseString(data, function (err, /**{projects: {project: Array<Object>}}*/ result) {
        result.projects.project.forEach(function (/**{id: Array<{_: number}, name: Array<string>}*/project) {
          var id = project.id.pop()._;
          var name = project.name.pop();
          clockanProjects[name] = id;
        });
        console.log("Known Clockan projects:")
        console.log(clockanProjects);
        callback(clockanProjects);
      });
    });
  });
};


/**
 * @param unreportedTimes {GroupedReport}
 * @param reportedTimes {GroupedReport}
 */
var processReport = function (unreportedTimes, reportedTimes) {
  var togglAuthorizationHeader = "Basic " + new Buffer(togglApiKey + ":api_token").toString("base64");
  var clockanAuthorizationHeader = "Basic " + new Buffer(clockanApiKey + ":x").toString("base64");
  https.get({
    "host": "www.clockan.com",
    "path": "/me.xml",
    "headers": {
      "Authorization": clockanAuthorizationHeader,
      "Accept": "application/xml",
      "User-Agent": userAgent
    }
  }, function (/**IncomingMessage*/ res) {
    var data = "";
    res.on("data", function (/**Buffer*/ chunk) {
      data += chunk;
    });
    res.on("end", function () {
      xml2js.parseString(data, function (err, /**{person: {id: Array<{_: number}>}}*/ result) {
        var clockanPersonId = result.person.id.pop()._;
        getClockanProjects(clockanApiKey, function (clockanProjects) {
          Object.keys(unreportedTimes).forEach(function (togglProjectName) {
            Object.keys(unreportedTimes[togglProjectName]).forEach(function (entryDate) {
              Object.keys(unreportedTimes[togglProjectName][entryDate]).forEach(function (description) {
                /**
                 * @type {{duration: number, ids: Array<number>}}
                 */
                var timeRecord = unreportedTimes[togglProjectName][entryDate][description];
                var clockanProjectName = config.projects[togglProjectName];
                var clockanProjectId = clockanProjects[clockanProjectName];
                console.log();
                console.log("Toggl project: " + togglProjectName);
                console.log("Clockan project: " + clockanProjectName + " " + clockanProjectId);
                console.log("Date (duration): " + entryDate + " (" + timeRecord.duration.toFixed(4) + ")");
                console.log("Task: " + description);
                console.log("Entry IDs: " + timeRecord.ids);
                // POST entry to Clockan
                if (clockanProjectId) {
                  var message = "<?xml version=\"1.0\"?>" +
                    "<time-entry>" +
                    "<person-id>" + clockanPersonId + "</person-id>" +
                    "<date>" + entryDate + "</date>" +
                    "<hours>" + timeRecord.duration.toFixed(4) + "</hours>" +
                    "<description>" + description + "</description>" +
                    "</time-entry>";
                  var createEntryRequest = https.request({
                    "method": "POST",
                    "host": "www.clockan.com",
                    "path": "/projects/" + clockanProjectId + "/time_entries.xml",
                    "headers": {
                      "Authorization": clockanAuthorizationHeader,
                      "Accept": "application/xml",
                      "Content-Type": "application/xml",
                      "User-Agent": "VaclavSir/ClockanToggl",
                      "Content-Length": Buffer.byteLength(message, "utf8")
                    }
                  }, function (/**IncomingMessage*/ res) {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                      res.on("data", function (data) {
                        console.log(data.toString());
                      })
                      // POST tag to Toggl
                      var togglTagRequest = https.request({
                        "method": "PUT",
                        "host": "www.toggl.com",
                        "path": "/api/v8/time_entries/" + timeRecord.ids.join(",") + "?" + queryString.stringify({
                          "user_agent": userAgent
                        }),
                        "headers": {
                          "Authorization": togglAuthorizationHeader
                        }
                      }, function (/**IncomingMessage*/ res) {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                          console.log("Tagged on Toggl with 'reported' tag.");
                        } else {
                          console.warn("Toggl returned status " + res.statusCode + ", tag 'reported' might not have been set.");
                        }
                      });
                      togglTagRequest.write(JSON.stringify({"time_entry": {"tags": ["reported"], "tag_action": "add"}}));
                      togglTagRequest.end();
                    } else {
                      console.warn("Clockan returned status " + res.statusCode + ", entries were not tagged.");
                    }
                  });
                  createEntryRequest.write(message);
                  createEntryRequest.end();
                  console.log("Sent to Clockan.");
                  console.log(message);
                }
              })
            })
          });
        });
      });
    });
  });
};

getTogglReport(togglApiKey, startDate, endDate, processReport);
