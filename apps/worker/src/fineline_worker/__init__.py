"""Fineline conversion worker."""

import os

# Native thread pools stay small and bounded under the container's pids limit (SR-021):
# conversions run in parallel through the worker's own slots, not inside NumPy or OpenCV.
# Set before NumPy or OpenCV are imported by any submodule; an explicit value wins.
for _variable in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS"):
    os.environ.setdefault(_variable, "1")
