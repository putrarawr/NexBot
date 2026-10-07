"""
SIMPKL browser automation — handles login + journal form submission
using undetected-chromedriver to bypass Cloudflare Turnstile.
"""

import os
import time
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from typing import Optional


BASE_URL = "https://pkl.smk1bws.sch.id"
LOGIN_URL = f"{BASE_URL}/login"
JURNAL_URL = f"{BASE_URL}/siswa/jurnal"
JURNAL_ADD_URL = f"{BASE_URL}/siswa/jurnal/add"


class SIMPKLBot:
    def __init__(self, chrome_binary: Optional[str] = None, headless: bool = False):
        options = uc.ChromeOptions()
        if headless:
            options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--disable-software-rasterizer")
        options.add_argument("--window-size=1280,900")

        if chrome_binary and os.path.exists(chrome_binary):
            options.binary_location = chrome_binary

        chrome_ver = self._detect_chrome_version(chrome_binary)
        print(f"  Chrome versi terdeteksi: {chrome_ver or 'auto'}")

        try:
            self.driver = uc.Chrome(options=options, version_main=chrome_ver)
        except Exception as uc_err:
            print(f"  uc.Chrome error ({uc_err}), fallback ke standard selenium webdriver...")
            from selenium import webdriver
            from selenium.webdriver.chrome.service import Service
            from selenium.webdriver.chrome.options import Options as SeleniumOptions

            std_options = SeleniumOptions()
            if headless:
                std_options.add_argument("--headless=new")
            std_options.add_argument("--no-sandbox")
            std_options.add_argument("--disable-dev-shm-usage")
            std_options.add_argument("--disable-gpu")
            std_options.add_argument("--disable-software-rasterizer")
            if chrome_binary and os.path.exists(chrome_binary):
                std_options.binary_location = chrome_binary

            driver_candidates = [
                "/usr/bin/chromedriver",
                "/usr/lib/chromium/chromedriver",
                "/usr/local/bin/chromedriver"
            ]
            driver_bin = next((d for d in driver_candidates if os.path.exists(d)), None)
            if driver_bin:
                service = Service(executable_path=driver_bin)
                self.driver = webdriver.Chrome(service=service, options=std_options)
            else:
                self.driver = webdriver.Chrome(options=std_options)

        self.wait = WebDriverWait(self.driver, 30)

    @staticmethod
    def _detect_chrome_version(binary: Optional[str] = None) -> Optional[int]:
        """Detect installed Chrome major version number."""
        import subprocess
        import re
        candidates = []
        if binary:
            candidates.append(binary)
        candidates.extend([
            "google-chrome",
            "google-chrome-stable",
            "chromium",
            "chromium-browser",
        ])
        for cmd in candidates:
            try:
                out = subprocess.check_output(
                    [cmd, "--version"], stderr=subprocess.DEVNULL, text=True
                )
                match = re.search(r"(\d+)\.\d+\.\d+", out)
                if match:
                    return int(match.group(1))
            except (FileNotFoundError, subprocess.CalledProcessError):
                continue
        return None

    def login(self, nisn: str, password: str) -> bool:
        """
        Login to SIMPKL. Tries auto-login first, falls back to manual login
        if Cloudflare or form detection fails.
        """
        print("  Membuka halaman login...")
        self.driver.get(LOGIN_URL)
        time.sleep(3)

        if self._is_logged_in():
            print("  Sudah login sebelumnya!")
            return True

        try:
            return self._auto_login(nisn, password)
        except Exception as e:
            print(f"\n  [!] Auto-login gagal: {e}")
            return self._manual_login()

    def _auto_login(self, nisn: str, password: str) -> bool:
        """Attempt automatic login by filling form fields."""
        print("  Menunggu Cloudflare selesai & form muncul...")
        self._wait_for_cloudflare_page(timeout=30)

        nisn_field = self._find_field(
            [
                (By.NAME, "username"),
                (By.NAME, "nis"),
                (By.ID, "username"),
                (By.ID, "nis"),
                (By.CSS_SELECTOR, "input[placeholder*='username']"),
            ],
            fallback_keyword="username",
            fallback_type="text",
        )
        nisn_field.clear()
        nisn_field.send_keys(nisn)

        pass_field = self._find_field(
            [(By.NAME, "password"), (By.ID, "password")],
            fallback_keyword="password",
            fallback_type="password",
        )
        pass_field.clear()
        pass_field.send_keys(password)

        print("  Menunggu Turnstile token...")
        self._wait_for_turnstile(timeout=60)

        try:
            submit = self.driver.find_element(
                By.CSS_SELECTOR, "button[type='submit']"
            )
        except Exception:
            submit = self.driver.find_element(
                By.CSS_SELECTOR, "input[type='submit']"
            )

        submit.click()
        time.sleep(5)

        if self._is_logged_in():
            print(f"  Login berhasil! → {self.driver.current_url}")
            return True

        print("  [!] Auto-login sepertinya gagal")
        return self._manual_login()

    def _manual_login(self) -> bool:
        """Let the user login manually in the open browser window."""
        print(f"\n  ╔══════════════════════════════════════════════╗")
        print(f"  ║  LOGIN MANUAL                                ║")
        print(f"  ║  Login di browser yang terbuka, lalu         ║")
        print(f"  ║  tekan ENTER di terminal ini untuk lanjut.   ║")
        print(f"  ╚══════════════════════════════════════════════╝")

        current = self.driver.current_url
        if "/login" not in current and "/siswa" not in current:
            self.driver.get(LOGIN_URL)

        input("\n  Tekan ENTER setelah berhasil login di browser... ")

        for _ in range(10):
            if self._is_logged_in():
                print(f"  Login berhasil! → {self.driver.current_url}")
                return True
            time.sleep(1)

        current = self.driver.current_url
        if "/login" not in current:
            print(f"  Login dianggap berhasil → {current}")
            return True

        print("  [!] Masih belum login. Coba jalankan ulang.")
        return False

    def _is_logged_in(self) -> bool:
        """Check if currently logged into SIMPKL."""
        current = self.driver.current_url
        return "/siswa/" in current and "/login" not in current

    def _wait_for_cloudflare_page(self, timeout: int = 30):
        """Wait for Cloudflare interstitial challenge page to pass."""
        start = time.time()
        while time.time() - start < timeout:
            page = self.driver.page_source.lower()
            has_form = (
                "nisn" in page
                or "<form" in page
                or "password" in page
            )
            if has_form:
                time.sleep(1)
                return

            title = self.driver.title.lower()
            if "just a moment" in title or "checking" in title:
                time.sleep(2)
                continue

            if "simpkl" in title or "masuk" in title or "login" in title:
                time.sleep(1)
                return

            time.sleep(2)

        print("  [!] Cloudflare challenge timeout")

    def _find_field(self, locators: list, fallback_keyword: str, fallback_type: str):
        """Try multiple locators to find a form field."""
        for by, value in locators:
            try:
                el = WebDriverWait(self.driver, 5).until(
                    EC.presence_of_element_located((by, value))
                )
                return el
            except TimeoutException:
                continue
        return self._find_input_by_type_or_placeholder(
            fallback_keyword, fallback_type
        )

    def submit_jurnal(self, tanggal: str, catatan: str) -> bool:
        """
        Submit a journal entry.
        tanggal: format MM/DD/YYYY (sesuai datepicker SIMPKL)
        catatan: isi catatan kegiatan
        Returns True on success.
        """
        self.driver.get(JURNAL_ADD_URL)
        time.sleep(3)

        date_input = self._find_date_input()
        if date_input:
            self.driver.execute_script("arguments[0].value = '';", date_input)
            self.driver.execute_script(
                "arguments[0].removeAttribute('readonly');", date_input
            )
            date_input.clear()
            date_input.send_keys(tanggal)
            self.driver.execute_script(
                "arguments[0].dispatchEvent(new Event('change', {bubbles: true}));",
                date_input,
            )
        time.sleep(1)

        textarea = self._find_textarea()
        if textarea:
            textarea.clear()
            textarea.send_keys(catatan)
        else:
            print(f"  [!] Textarea tidak ditemukan untuk tanggal {tanggal}")
            return False

        time.sleep(1)

        try:
            submit = self.driver.find_element(
                By.CSS_SELECTOR,
                "button[type='submit'], input[type='submit']",
            )
            submit.click()
        except Exception:
            forms = self.driver.find_elements(By.TAG_NAME, "form")
            if forms:
                forms[0].submit()

        time.sleep(3)

        current = self.driver.current_url
        page_source = self.driver.page_source.lower()
        if "/jurnal" in current and "berhasil" in page_source:
            return True
        if "/jurnal/add" not in current:
            return True

        return False

    def get_existing_dates(self) -> set[str]:
        """
        Scrape the jurnal list page to find dates that already have entries.
        Returns set of date strings in YYYY-MM-DD format.
        """
        self.driver.get(JURNAL_URL)
        time.sleep(3)

        existing = set()

        try:
            show_all = self.driver.find_element(
                By.CSS_SELECTOR, "select[name*='length'], select.form-select"
            )
            for option in show_all.find_elements(By.TAG_NAME, "option"):
                if option.get_attribute("value") in ("-1", "100"):
                    option.click()
                    time.sleep(2)
                    break
        except Exception:
            pass

        rows = self.driver.find_elements(
            By.CSS_SELECTOR, "table tbody tr, .jurnal-item, .card"
        )
        for row in rows:
            text = row.text
            date_str = self._extract_date_from_text(text)
            if date_str:
                existing.add(date_str)

        return existing

    def close(self):
        try:
            self.driver.quit()
        except Exception:
            pass

    def _wait_for_turnstile(self, timeout: int = 60):
        """Wait for Cloudflare Turnstile challenge to auto-resolve."""
        start = time.time()
        while time.time() - start < timeout:
            try:
                response_input = self.driver.find_element(
                    By.CSS_SELECTOR,
                    "input[name='cf-turnstile-response'], "
                    "input[name='cf_turnstile_response']",
                )
                val = response_input.get_attribute("value")
                if val and len(val) > 10:
                    print("  Turnstile resolved!")
                    return
            except Exception:
                pass

            try:
                iframes = self.driver.find_elements(
                    By.CSS_SELECTOR, "iframe[src*='turnstile']"
                )
                if iframes:
                    time.sleep(2)
                else:
                    return
            except Exception:
                pass

            time.sleep(2)

        print("  [!] Turnstile timeout, mencoba submit tanpa menunggu...")

    def _find_input_by_type_or_placeholder(self, keyword: str, input_type: str):
        inputs = self.driver.find_elements(By.TAG_NAME, "input")
        for inp in inputs:
            placeholder = (inp.get_attribute("placeholder") or "").lower()
            name = (inp.get_attribute("name") or "").lower()
            inp_type = (inp.get_attribute("type") or "").lower()
            if keyword in placeholder or keyword in name or inp_type == input_type:
                return inp
        raise Exception(f"Input field for '{keyword}' not found")

    def _find_date_input(self):
        selectors = [
            "input[type='date']",
            "input[name*='tanggal']",
            "input[name*='date']",
            "input.datepicker",
            "input.form-control[placeholder*='tanggal']",
        ]
        for sel in selectors:
            try:
                el = self.driver.find_element(By.CSS_SELECTOR, sel)
                return el
            except Exception:
                continue

        inputs = self.driver.find_elements(By.TAG_NAME, "input")
        for inp in inputs:
            placeholder = (inp.get_attribute("placeholder") or "").lower()
            name = (inp.get_attribute("name") or "").lower()
            if "tanggal" in placeholder or "date" in name or "tanggal" in name:
                return inp

        return None

    def _find_textarea(self):
        selectors = [
            "textarea[name*='catatan']",
            "textarea[name*='kegiatan']",
            "textarea[name*='content']",
            "textarea[name*='isi']",
            "textarea",
        ]
        for sel in selectors:
            try:
                el = self.driver.find_element(By.CSS_SELECTOR, sel)
                return el
            except Exception:
                continue
        return None

    def _extract_date_from_text(self, text: str) -> Optional[str]:
        """Parse Indonesian date like '07 September 2026' to YYYY-MM-DD."""
        import re

        months = {
            "januari": "01",
            "februari": "02",
            "maret": "03",
            "april": "04",
            "mei": "05",
            "juni": "06",
            "juli": "07",
            "agustus": "08",
            "september": "09",
            "oktober": "10",
            "november": "11",
            "desember": "12",
        }
        pattern = r"(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})"
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            day = match.group(1).zfill(2)
            month = months.get(match.group(2).lower(), "01")
            year = match.group(3)
            return f"{year}-{month}-{day}"
        return None
