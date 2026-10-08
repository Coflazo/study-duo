# Unpacks a Chrome Web Store CRX3 into a folder, refusing any path that would land outside it.
# python3 -I bench/uncrx.py <file.crx> <out-dir>
import io, struct, sys, zipfile, pathlib
crx, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
b = crx.read_bytes()
assert b[:4] == b'Cr24', 'not a CRX'
ver, hlen = struct.unpack('<II', b[4:12])
assert ver == 3, ver
z = zipfile.ZipFile(io.BytesIO(b[12 + hlen:]))
for m in z.infolist():  # refuse paths that escape the folder
    p = (out / m.filename).resolve()
    assert str(p).startswith(str(out.resolve())), m.filename
z.extractall(out)
