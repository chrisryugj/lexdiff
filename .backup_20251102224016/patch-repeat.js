const origRepeat = String.prototype.repeat;

String.prototype.repeat = function patchedRepeat(count) {
  if (typeof count === "number" && count < 0) {
    const err = new RangeError(`String.repeat called with negative count (${count})`);
    console.error("[repeat-debug]", err);
    console.error(err.stack);
    count = 0;
  }
  return origRepeat.call(this, count);
};
