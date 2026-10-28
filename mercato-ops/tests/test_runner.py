import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("runner", Path(__file__).resolve().parents[1] / "runner.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class TestReadOnlyAllowlist(unittest.TestCase):
    def test_health(self):
        self.assertEqual(runner.build_params({"action": "health"}), {"action": "health"})

    def test_search_limit(self):
        self.assertEqual(runner.build_params({"action": "product_search", "params": {"q": "кава", "limit": 100}}),
                         {"action": "product_search", "q": "кава", "limit": 20})

    def test_no_write(self):
        with self.assertRaises(ValueError):
            runner.build_params({"action": "publish_content", "params": {"id": 1}})

    def test_no_unsafe_url(self):
        with self.assertRaises(ValueError):
            runner.build_params({"action": "product_read", "params": {"url": "https://attacker.example/product"}})

    def test_item(self):
        self.assertEqual(runner.build_params({"action": "product_read", "params": {"product_id": 7}}),
                         {"action": "product_read", "product_id": 7})


if __name__ == "__main__":
    unittest.main()
