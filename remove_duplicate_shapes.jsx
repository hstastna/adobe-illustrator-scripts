// Remove all duplicate paths (geometry only) in Adobe Illustrator.
// Leave only one of all visually identical paths, ignoring very small differences (less strict).
// The script works also for CompoundPathItems in addition to PathItems.

// Potential issues, improvements:
// - rare hash collisions: if two distinct paths round to the same hash due to low precision, both will be considered duplicates - check pathToHash function
// - for huge documents (thousands of paths), using an object as a hash map can improve performance

var precision = 1; // smallest precision for deduplication is 0 (change according your preference)
var containerTypes = ["GroupItem", "CompoundPathItem", "Layer"];

// Helper function
function isContainerType(typeName) {
  for (var i = 0; i < containerTypes.length; i++) {
    if (containerTypes[i] === typeName) return true;
  }

  return false;
}

// Hash a PathItem's geometry to compare paths (regardless of their color, layer, group, etc.)
function pathToHash(path) {
  if (!path || !("pathPoints" in path) || path.pathPoints.length === 0)
    return "";

  var pathPointsLength = path.pathPoints.length;
  var pointHashes = [];

  for (var i = 0; i < pathPointsLength; i++) {
    var pt = path.pathPoints[i]; // PathPoint object

    pointHashes.push(
      [
        pt.anchor[0].toFixed(precision),
        pt.anchor[1].toFixed(precision),
        pt.leftDirection[0].toFixed(precision),
        pt.leftDirection[1].toFixed(precision),
        pt.rightDirection[0].toFixed(precision),
        pt.rightDirection[1].toFixed(precision),
        pt.pointType,
      ].join(",")
    );
  }

  var closed = path.closed ? "closed" : "open"; // check this path's property for its uniqueness

  return pointHashes.join(";") + "|" + closed;
}

// Hash all subpaths of a compound path as a single string
function compoundPathToHash(compoundPath) {
  if (
    !compoundPath ||
    !("pathItems" in compoundPath) ||
    compoundPath.pathItems.length === 0
  )
    return "";

  var pathItemsLength = compoundPath.pathItems.length;
  var subpathHashes = [];

  for (var i = 0; i < pathItemsLength; i++) {
    subpathHashes.push(pathToHash(compoundPath.pathItems[i]));
  }

  // Sort for order-insensitive comparison (optional, recommended)
  subpathHashes.sort();

  return subpathHashes.join("|");
}

// Recursively gather all eligible paths within a container (Layer, Group, CompoundPath, or Document)
function collectPaths(container, paths, pageItemTypename) {
  if (pageItemTypename === undefined) pageItemTypename = "PathItem";

  if (!container || !("pageItems" in container)) return;

  var pageItemsLength = container.pageItems.length;

  for (var i = 0; i < pageItemsLength; i++) {
    var pageItem = container.pageItems[i];

    // Skip locked, hidden, guides, or clipping items
    if (
      !pageItem ||
      pageItem.locked ||
      pageItem.hidden ||
      pageItem.guides ||
      pageItem.clipping
    )
      continue;

    if (pageItem.typename === pageItemTypename) {
      if (
        pageItemTypename === "PathItem" &&
        pageItem.pathPoints &&
        pageItem.pathPoints.length > 0
      ) {
        paths.push(pageItem); // push only if PathItems aren't empty
      }

      if (
        pageItemTypename === "CompoundPathItem" &&
        pageItem.pathItems &&
        pageItem.pathItems.length > 0
      ) {
        paths.push(pageItem);
      }
    } else if (isContainerType(pageItem.typename)) {
      collectPaths(pageItem, paths, pageItemTypename);
    }
  }
}

// Recursively gather all compound paths
function collectCompoundPaths(container, paths) {
  return collectPaths(container, paths, "CompoundPathItem");
}

function main() {
  if (app.documents.length === 0) {
    alert("No documents are open.");
    return;
  }

  var doc = app.activeDocument;

  // 1. Deduplicate compound paths first
  var compoundPaths = [];
  var docLayersLength = doc.layers.length;

  for (var i = 0; i < docLayersLength; i++) {
    collectCompoundPaths(doc.layers[i], compoundPaths);
  }

  var hashToCompoundPaths = {};
  var compoundPathsLength = compoundPaths.length;

  for (var i = 0; i < compoundPathsLength; i++) {
    var compoundPath = compoundPaths[i];
    var hash = compoundPathToHash(compoundPath);

    if (!hash) continue;

    if (!hashToCompoundPaths[hash]) hashToCompoundPaths[hash] = [];

    hashToCompoundPaths[hash].push(compoundPath);
  }

  var compoundRemovedCount = 0;

  for (var hash in hashToCompoundPaths) {
    var dups = hashToCompoundPaths[hash];

    for (var j = 1; j < dups.length; j++) {
      try {
        dups[j].remove();
        compoundRemovedCount++;
      } catch (e) {
        $.writeln(e);
      }
    }
  }

  // 2. Deduplicate individual paths
  var paths = [];

  // Use selection if available, else all PathItems in document (recursively)
  if (doc.selection && doc.selection.length > 0) {
    var docSelectionLength = doc.selection.length;

    for (var i = 0; i < docSelectionLength; i++) {
      var selectionItem = doc.selection[i];

      // Skip locked, hidden, guides, or clipping items
      if (
        !selectionItem ||
        selectionItem.locked ||
        selectionItem.hidden ||
        selectionItem.guides ||
        selectionItem.clipping
      )
        continue;

      if (selectionItem.typename === "PathItem") {
        paths.push(selectionItem);
      } else if (isContainerType(selectionItem.typename)) {
        collectPaths(selectionItem, paths);
      }
    }
  } else {
    for (var i = 0; i < docLayersLength; i++) {
      collectPaths(doc.layers[i], paths);
    }
  }

  var pathsLength = paths.length;

  if (pathsLength === 0 && compoundPathsLength === 0) {
    alert(
      "No eligible paths found (check for locked/hidden items, or groups/compound paths)."
    );
    return;
  }

  var hashToPaths = {};

  for (var i = 0; i < pathsLength; i++) {
    var path = paths[i];
    var hash = pathToHash(path);

    if (!hash) continue;

    if (!hashToPaths[hash]) {
      hashToPaths[hash] = [];
    }

    hashToPaths[hash].push(path);
  }

  // For each set, remove all but one
  var removedCount = 0;

  for (var hash in hashToPaths) {
    var duplicatePaths = hashToPaths[hash];
    var duplicatePathsLength = duplicatePaths.length;

    // Keep the first one, remove the rest
    for (var j = 1; j < duplicatePathsLength; j++) {
      try {
        duplicatePaths[j].remove();
        removedCount++;
      } catch (e) {
        $.writeln(e); // Print error details to the JavaScript Console
      }
    }
  }

  alert(
    "Removed " +
      removedCount +
      " duplicate path item" +
      (removedCount === 1 ? ", " : "s, ") +
      compoundRemovedCount +
      " duplicate compound path" +
      (compoundRemovedCount === 1 ? "!" : "s!")
  );
}

main();
