"use strict";
/*global setImmediate: true*/

var base = require("xbase"),
	C = require("C"),
	fs = require("fs"),
	shared = require("shared"),
	path = require("path"),
	tiptoe = require("tiptoe");

if(process.argv.length<4)
{
	base.error("Usage: node %s <all|oracle|original|languages|printings|legalities|mcilist|listings> <set codes>", process.argv[1]);
	process.exit(1);
}

var VALID_TYPES = ["oracle", "original", "languages", "printings", "legalities", "mcilist", "listings"];

var cacheTypes = process.argv[2].toLowerCase()==="all" ? VALID_TYPES : Array.toArray(process.argv[2]);
cacheTypes.serialForEach(function(cacheType, cb)
{
	if(!VALID_TYPES.contains(cacheType))
	{
		base.error("Invalid cacheType: %s", cacheType);
		return;
	}

	base.info("Clearing cache type: %s", cacheType);

	shared.getSetsToDo(3).serialForEach(function(code, subcb) { clearCacheForSet(code, cacheType, subcb); }, cb);
}, function(err)
	{
		if(err)
		{
			base.error(err);
			process.exit(1);
		}

		process.exit(0);
	}
);

function clearCacheForSet(code, cacheType, cb)
{
	var setName = C.SETS.mutateOnce(function(SET) { if(SET.code.toLowerCase()===code.toLowerCase()) { return SET; } }).name;

	tiptoe(
		function loadSetJSON()
		{
			fs.readFile(path.join(__dirname, "..", "json", code + ".json"), {encoding : "utf8"}, this);
		},
		function getCacheURLS(setRaw)
		{
			var set = JSON.parse(setRaw);
			if(cacheType==="mcilist")
			{
				if(!set.isMCISet) {
					base.info("Not MCISet");

					if (!set.magicCardsInfoCode)
						return this.finish();
				}

				var urls = [];
				var mciListUrl = "http://magiccards.info/" + set.magicCardsInfoCode.toLowerCase() + "/en.html";
				urls.push(mciListUrl);
				var targetSet = C.SETS.mutateOnce(function(SET) { if(SET.code.toLowerCase()===set.code.toLowerCase()) { return SET; } });
				if (targetSet.magicRaritiesCodes) {
					targetSet.magicRaritiesCodes.forEach(function(magicRaritiesCode)
					{
						urls.push("http://www.magiclibrarities.net/" + magicRaritiesCode + "-english-cards-index.html");
					}.bind(this));
				}

				// Retrieve all mci info and clear it
				base.info("MCI Set code: %s", set.magicCardsInfoCode);
				var cb = this;
				tiptoe(
					function getList() {
						base.info('Getting URL Contents for: %s', mciListUrl);
						shared.getURLAsDoc(mciListUrl, this);
					},
					function getURLs(listDoc) {
						var mciCardLinks = Array.toArray(listDoc.querySelectorAll("table tr td a"));
						var validLinks = mciCardLinks.filter(function(link) {
							var href = link.getAttribute("href");
							return (href.indexOf(set.magicCardsInfoCode) >= 0);
						});
						validLinks.forEach(function(idx) {
							var href = idx.getAttribute("href");
							urls.push("http://magiccards.info" + href);
						});

						this();
					},
					function finish(err) {
						cb(err, urls);
					}
				);
			}
			else if(cacheType==="listings")
			{
				return shared.buildMultiverseListingURLs(setName, this);
			}
			else
			{
				base.info("%s: %d cards found.", code, set.cards.length);
				set.cards.filter(function(card) { return card.hasOwnProperty("multiverseid"); }).serialForEach(function(card, subcb)
				{
					shared.buildCacheFileURLs(card, cacheType, subcb, true);
				}, this);
			}
		},
		function clearCacheFiles(urls)
		{
			urls = urls.flatten().uniqueBySort();

			base.info("Clearing %d URLS", urls.length);
			urls.serialForEach(shared.clearCacheFile, this);
		},
		function finish(err)
		{
			setImmediate(function() { cb(err); });
		}
	);
}


