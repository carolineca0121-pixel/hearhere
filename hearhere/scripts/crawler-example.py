"""
HearHere Insight Hub — 本地爬虫示例（可选）

启动后设置：
  INSIGHT_SOURCE=crawler
  CRAWLER_URL=http://localhost:8000/api/insights

运行：python scripts/crawler-example.py
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import json

MOCK = [
    {
        "id": "c1",
        "title": "爬虫示例 · 海边栈道",
        "review": "从本地脚本返回的示例评价。",
        "reason": "演示 Python 爬虫对接",
        "imageUrl": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80",
        "sourceUrl": "http://localhost:8000",
    }
]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        q = qs.get("q", ["旅行"])[0]
        body = json.dumps({"cards": MOCK, "query": q}, ensure_ascii=False)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))


if __name__ == "__main__":
    print("Insight crawler on http://localhost:8000/api/insights?q=...")
    HTTPServer(("localhost", 8000), Handler).serve_forever()
