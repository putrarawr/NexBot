"""
SIMPKL browser automation — handles login + journal form submission
using undetected-chromedriver to bypass Cloudflare Turnstile.
No emojis in console logs or code comments.
"""

import json
import os
import re
import sys
import time
from typing import Optional

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException


BASE_URL = "https://pkl.smk1bws.sch.id"
LOGIN_URL = f"{BASE_URL}/login"
JURNAL_URL = f"{BASE_URL}/siswa/jurnal"
JURNAL_ADD_URL = f"{BASE_URL}/siswa/jurnal/add"


class SIMPKLBot:
    def __init__(self, chrome_binary: Optional[str] = None, headless: bool = False):
        self.display = None
        self.driver = None
        self.last_error = ""

        # Check display availability
        # Cloudflare Turnstile is actively blocked by --headless=new.
        # When a real DISPLAY is present, or Xvfb virtual display is started,
        # Chrome runs in standard display mode so Turnstile solves reliably in 3-4 seconds.
        has_real_display = bool(os.environ.get("DISPLAY"))
        use_virtual_display = False
        self.xvfb_proc = None

        if not has_real_display:
            try:
                from pyvirtualdisplay import Display
                self.display = Display(visible=False, size=(1280, 900))
                self.display.start()
                use_virtual_display = True
                print("  Virtual display (Xvfb via pyvirtualdisplay) berhasil diaktifkan.")
            except Exception as e1:
                try:
                    import subprocess
                    display_num = ":99"
                    self.xvfb_proc = subprocess.Popen(
                        ["Xvfb", display_num, "-screen", "0", "1280x900x24", "-nolisten", "tcp"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                    time.sleep(1)
                    os.environ["DISPLAY"] = display_num
                    use_virtual_display = True
                    print(f"  Virtual display (Xvfb native {display_num}) berhasil diaktifkan.")
                except Exception as e2:
                    print(f"  [!] Virtual display tidak aktif: {e1} / {e2}")
                    self.display = None

        should_use_chrome_headless = headless and not has_real_display and not use_virtual_display
        self.is_headless = should_use_chrome_headless
        self.requested_headless = headless

        options = uc.ChromeOptions()
        if should_use_chrome_headless:
            options.add_argument("--headless=new")

        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1280,900")

        if not chrome_binary:
            chrome_binary = os.environ.get("CHROME_BINARY")

        if chrome_binary and os.path.exists(chrome_binary):
            options.binary_location = chrome_binary

        chrome_ver = self._detect_chrome_version(chrome_binary)
        print(f"  Chrome versi terdeteksi: {chrome_ver or 'auto'}")

        driver_candidates = [
            os.environ.get("CHROMEDRIVER_PATH", ""),
            "/usr/bin/chromedriver",
            "/usr/lib/chromium/chromedriver",
            "/usr/local/bin/chromedriver",
        ]
        driver_bin = next((d for d in driver_candidates if d and os.path.exists(d)), None)
        if driver_bin:
            print(f"  ChromeDriver terdeteksi di: {driver_bin}")

        try:
            if driver_bin:
                self.driver = uc.Chrome(
                    options=options,
                    version_main=chrome_ver,
                    driver_executable_path=driver_bin,
                )
            else:
                self.driver = uc.Chrome(options=options, version_main=chrome_ver)
        except Exception as uc_err:
            print(f"  uc.Chrome error ({uc_err}), fallback ke standard selenium webdriver...")
            from selenium import webdriver
            from selenium.webdriver.chrome.service import Service
            from selenium.webdriver.chrome.options import Options as SeleniumOptions

            std_options = SeleniumOptions()
            if should_use_chrome_headless:
                std_options.add_argument("--headless=new")
            std_options.add_argument("--no-sandbox")
            std_options.add_argument("--disable-dev-shm-usage")
            std_options.add_argument("--window-size=1280,900")
            std_options.add_argument("--disable-blink-features=AutomationControlled")
            std_options.add_experimental_option("excludeSwitches", ["enable-automation"])
            std_options.add_experimental_option("useAutomationExtension", False)

            if chrome_binary and os.path.exists(chrome_binary):
                std_options.binary_location = chrome_binary

            if driver_bin:
                service = Service(executable_path=driver_bin)
                self.driver = webdriver.Chrome(service=service, options=std_options)
            else:
                self.driver = webdriver.Chrome(options=std_options)

            try:
                self.driver.execute_cdp_cmd(
                    "Page.addScriptToEvaluateOnNewDocument",
                    {
                        "source": """
                            Object.defineProperty(navigator, 'webdriver', {
                                get: () => undefined
                            });
                        """
                    },
                )
            except Exception:
                pass

        self.wait = WebDriverWait(self.driver, 30)

    @staticmethod
    def _detect_chrome_version(binary: Optional[str] = None) -> Optional[int]:
        """Detect installed Chrome major version number."""
        import subprocess
        candidates = []
        if binary:
            candidates.append(binary)
        candidates.extend([
            os.environ.get("CHROME_BINARY", ""),
            "chromium",
            "chromium-browser",
            "google-chrome",
            "google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/google-chrome",
        ])
        candidates = [c for c in candidates if c]
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

    @staticmethod
    def _get_cookie_file_path() -> str:
        base = os.path.dirname(os.path.abspath(__file__))
        candidates = [
            os.path.abspath(os.path.join(base, "../../../../data/simpkl_cookies.json")),
            os.path.abspath(os.path.join(base, "../../../data/simpkl_cookies.json")),
            os.path.abspath(os.path.join(base, "../../data/simpkl_cookies.json")),
            os.path.join(base, "simpkl_cookies.json"),
        ]
        for c in candidates:
            if os.path.exists(os.path.dirname(c)):
                return c
        return os.path.join(base, "simpkl_cookies.json")

    def _save_cookies(self):
        try:
            cookies = self.driver.get_cookies()
            fpath = self._get_cookie_file_path()
            os.makedirs(os.path.dirname(fpath), exist_ok=True)
            with open(fpath, "w", encoding="utf-8") as f:
                json.dump(cookies, f, indent=2)
            print("  Session cookies berhasil disimpan.")
        except Exception as e:
            print(f"  [!] Gagal menyimpan session cookies: {e}")

    def _load_cookies(self) -> bool:
        fpath = self._get_cookie_file_path()
        if not os.path.exists(fpath):
            return False
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                cookies = json.load(f)
            if not isinstance(cookies, list) or not cookies:
                return False
            self.driver.get(LOGIN_URL)
            time.sleep(1)
            for c in cookies:
                try:
                    self.driver.add_cookie(c)
                except Exception:
                    pass
            self.driver.get(JURNAL_URL)
            time.sleep(2)
            if self._is_logged_in():
                print("  Berhasil menggunakan session cookies yang tersimpan.")
                return True
        except Exception as e:
            print(f"  [!] Gagal memuat session cookies: {e}")
        return False

    def login(self, nisn: str, password: str) -> bool:
        """
        Login to SIMPKL. First attempts session cookies reuse,
        then tries auto-login with Turnstile bypass.
        """
        if self._load_cookies():
            return True

        print("  Membuka halaman login...")
        self.driver.get(LOGIN_URL)
        time.sleep(2)

        if self._is_logged_in():
            print("  Sudah login sebelumnya!")
            self._save_cookies()
            return True

        try:
            success = self._auto_login(nisn, password)
            if success:
                self._save_cookies()
                return True
            return self._manual_login()
        except Exception as e:
            print(f"\n  [!] Auto-login gagal: {e}")
            return self._manual_login()

    def _auto_login(self, nisn: str, password: str) -> bool:
        """Attempt automatic login by filling form fields."""
        print("  Menunggu Cloudflare selesai & form muncul...")
        self._wait_for_cloudflare_page(timeout=25)

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
        self._wait_for_turnstile(timeout=30)

        try:
            submit = self.driver.find_element(
                By.CSS_SELECTOR, "button[type='submit']"
            )
        except Exception:
            submit = self.driver.find_element(
                By.CSS_SELECTOR, "input[type='submit']"
            )

        submit.click()
        time.sleep(4)

        if self._is_logged_in():
            print(f"  Login berhasil! → {self.driver.current_url}")
            return True

        err = self._detect_login_error()
        if err:
            self.last_error = f"Respon portal: {err}"
            print(f"  [!] Respon portal SIMPKL: {err}")
        elif not self.last_error:
            self.last_error = "Autentikasi gagal atau sesi tidak dapat diverifikasi oleh portal SIMPKL"

        return False

    def _detect_login_error(self) -> Optional[str]:
        """Check for portal error messages on the login page."""
        try:
            error_selectors = [
                ".alert.alert-danger",
                ".alert-danger",
                ".alert",
                ".text-danger",
                ".error-message",
                ".swal2-content",
            ]
            for sel in error_selectors:
                elements = self.driver.find_elements(By.CSS_SELECTOR, sel)
                for el in elements:
                    txt = el.text.strip()
                    if txt:
                        return txt
        except Exception:
            pass
        return None

    def _manual_login(self) -> bool:
        """Handle login when auto-login does not succeed."""
        if self._is_logged_in():
            self._save_cookies()
            return True

        # In automated or non-interactive environment (Telegram bot runner, docker, background tasks)
        # NEVER block on input() to avoid freezing execution
        is_automated = (
            self.requested_headless
            or self.is_headless
            or os.environ.get("NON_INTERACTIVE") == "1"
            or not sys.stdin.isatty()
        )
        if is_automated:
            err = self._detect_login_error()
            msg = err or self.last_error or "Verifikasi keamanan atau kredensial SIMPKL belum sesuai"
            self.last_error = msg
            print(f"  [!] Mode otomatis: melewati login manual terminal ({msg}).")
            return False

        print(f"\n  ╔══════════════════════════════════════════════╗")
        print(f"  ║  LOGIN MANUAL                                ║")
        print(f"  ║  Login di browser yang terbuka, lalu         ║")
        print(f"  ║  tekan ENTER di terminal ini untuk lanjut.   ║")
        print(f"  ╚══════════════════════════════════════════════╝")

        current = self.driver.current_url
        if "/login" not in current and "/siswa" not in current:
            self.driver.get(LOGIN_URL)

        try:
            input("\n  Tekan ENTER setelah berhasil login di browser... ")
        except (EOFError, OSError):
            return False

        for _ in range(10):
            if self._is_logged_in():
                print(f"  Login berhasil! → {self.driver.current_url}")
                self._save_cookies()
                return True
            time.sleep(1)

        current = self.driver.current_url
        if "/login" not in current:
            print(f"  Login dianggap berhasil → {current}")
            self._save_cookies()
            return True

        print("  [!] Masih belum login. Coba jalankan ulang.")
        return False

    def _is_logged_in(self) -> bool:
        """Check if currently logged into SIMPKL."""
        try:
            current = self.driver.current_url
            return "/siswa" in current and "/login" not in current
        except Exception:
            return False

    def _wait_for_cloudflare_page(self, timeout: int = 25):
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

            time.sleep(1)

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
        time.sleep(2)

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
        time.sleep(2)

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
            if self.driver:
                self.driver.quit()
        except Exception:
            pass
        finally:
            if self.display:
                try:
                    self.display.stop()
                except Exception:
                    pass
            if hasattr(self, "xvfb_proc") and self.xvfb_proc:
                try:
                    self.xvfb_proc.terminate()
                except Exception:
                    pass

    def _wait_for_turnstile(self, timeout: int = 40):
        """Wait for Cloudflare Turnstile challenge to auto-resolve."""
        from selenium.webdriver.common.action_chains import ActionChains

        start = time.time()
        while time.time() - start < timeout:
            try:
                response_inputs = self.driver.find_elements(
                    By.CSS_SELECTOR,
                    "input[name='cf-turnstile-response'], "
                    "input[name='cf_turnstile_response']",
                )
                if response_inputs:
                    val = response_inputs[0].get_attribute("value")
                    if val and len(val) > 10:
                        print("  Turnstile resolved!")
                        return True
            except Exception:
                pass

            # If not yet resolved after 3s, click the Turnstile checkbox widget at offset (28, 32)
            elapsed = time.time() - start
            if elapsed >= 3 and int(elapsed) % 4 == 0:
                try:
                    cf_divs = self.driver.find_elements(By.CSS_SELECTOR, ".cf-turnstile")
                    if cf_divs:
                        ActionChains(self.driver).move_to_element_with_offset(cf_divs[0], 28, 32).click().perform()
                except Exception:
                    pass

            time.sleep(1)

        print("  [!] Turnstile timeout, mencoba submit form...")
        self.last_error = "Verifikasi Cloudflare Turnstile melebihi batas waktu (timeout)"
        return False

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
