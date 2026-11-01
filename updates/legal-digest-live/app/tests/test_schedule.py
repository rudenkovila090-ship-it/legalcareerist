import os
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@unittest.skipUnless(shutil.which("bash"), "нужен bash")
class ScheduleScriptTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.home = Path(tmp.name)

    def project(self, parent: Path) -> Path:
        project = parent / "telegram-digest"
        (project / "data").mkdir(parents=True)
        (project / ".venv" / "bin").mkdir(parents=True)
        (project / ".venv" / "bin" / "python").symlink_to(sys.executable)
        shutil.copy(ROOT / "schedule-mac.sh", project)
        (project / ".env").write_text("TG_API_ID=1\n")
        (project / "data" / "session.session").write_text("")
        (project / "requirements.txt").write_text("")
        return project

    def run_script(self, project: Path, *args: str) -> subprocess.CompletedProcess:
        env = dict(os.environ, HOME=str(self.home))
        return subprocess.run(["bash", str(project / "schedule-mac.sh"), *args], capture_output=True, text=True, env=env)

    def test_dry_run_prints_a_valid_launchd_plist(self):
        project = self.project(self.home)
        result = self.run_script(project, "--dry-run", "08:30")
        self.assertEqual(result.returncode, 0, result.stderr)
        plist = plistlib.loads(result.stdout.encode())
        self.assertEqual(plist["Label"], "ru.careerlawyer.digest")
        self.assertEqual(
            plist["ProgramArguments"], [str(project / ".venv" / "bin" / "python"), "-m", "digest", "run", "--auto"]
        )
        self.assertEqual(plist["WorkingDirectory"], str(project))
        self.assertEqual(plist["StartCalendarInterval"], {"Hour": 8, "Minute": 30})
        self.assertEqual(plist["StandardOutPath"], str(project / "data" / "run.log"))
        self.assertFalse((self.home / "Library").exists(), "dry-run ничего не должен создавать")

    def test_the_job_also_runs_when_the_mac_is_switched_on_or_the_schedule_is_installed(self):
        result = self.run_script(self.project(self.home), "--dry-run")
        self.assertIs(plistlib.loads(result.stdout.encode())["RunAtLoad"], True)

    def test_default_is_nine_and_three_in_the_afternoon(self):
        result = self.run_script(self.project(self.home), "--dry-run")
        self.assertEqual(
            plistlib.loads(result.stdout.encode())["StartCalendarInterval"],
            [{"Hour": 9, "Minute": 0}, {"Hour": 15, "Minute": 0}],
        )

    def test_several_times_can_be_given(self):
        result = self.run_script(self.project(self.home), "--dry-run", "8:30", "13:05", "18:00")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            plistlib.loads(result.stdout.encode())["StartCalendarInterval"],
            [{"Hour": 8, "Minute": 30}, {"Hour": 13, "Minute": 5}, {"Hour": 18, "Minute": 0}],
        )

    def test_path_with_special_characters_stays_valid_xml(self):
        project = self.project(self.home / "A & B <c>")
        result = self.run_script(project, "--dry-run")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(plistlib.loads(result.stdout.encode())["WorkingDirectory"], str(project))

    def test_refuses_folders_macos_hides_from_background_jobs(self):
        for folder in ("Downloads", "Desktop", "Documents"):
            project = self.project(self.home / folder / "outer")
            result = self.run_script(project, "--dry-run")
            self.assertNotEqual(result.returncode, 0, folder)
            self.assertIn("mv ", result.stderr)

    def test_requires_env_and_login(self):
        project = self.project(self.home)
        (project / ".env").unlink()
        self.assertNotEqual(self.run_script(project, "--dry-run").returncode, 0)
        (project / ".env").write_text("TG_API_ID=1\n")
        (project / "data" / "session.session").unlink()
        result = self.run_script(project, "--dry-run")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("login", result.stderr)

    def test_rejects_bad_time(self):
        project = self.project(self.home)
        for bad in ("25:00", "9:61", "девять"):
            self.assertNotEqual(self.run_script(project, "--dry-run", bad).returncode, 0, bad)
        self.assertNotEqual(self.run_script(project, "--dry-run", "9:00", "24:00").returncode, 0)


if __name__ == "__main__":
    unittest.main()
