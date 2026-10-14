"""Start ClairForm locally: python scripts/run.py  [--port 8000] [--host 127.0.0.1]

The prebuilt interface in frontend/dist is served as-is. Use scripts/build_frontend.py only
if you modify the TypeScript sources.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Lancer ClairForm en local")
    parser.add_argument("--host", default=os.environ.get("CLAIRFORM_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("CLAIRFORM_PORT") or os.environ.get("PORT") or "8000"))
    parser.add_argument("--data-dir", default=None, help="dossier de stockage (défaut : ./storage)")
    args = parser.parse_args()
    if args.data_dir:
        os.environ["CLAIRFORM_DATA_DIR"] = args.data_dir
    if not (ROOT / "frontend" / "dist" / "index.html").is_file():
        sys.exit("Interface absente : lancez d'abord  python scripts/build_frontend.py")
    public = os.environ.get("CLAIRFORM_MODE", "local").strip().lower() == "public"
    if args.host not in {"127.0.0.1", "localhost", "::1"} and not public:
        print("Attention : ClairForm n'a pas d'authentification. Ne l'exposez que sur un réseau de confiance.\n"
              "Ajoutez le nom d'hôte utilisé dans CLAIRFORM_ALLOWED_HOSTS.", file=sys.stderr)
    import uvicorn

    print(f"ClairForm : http://{'localhost' if args.host in {'127.0.0.1', '::1'} else args.host}:{args.port}")
    uvicorn.run("clairform.app:create_app", factory=True, host=args.host, port=args.port, log_level="warning",
                proxy_headers=public, forwarded_allow_ips="*" if public else None)


if __name__ == "__main__":
    main()
