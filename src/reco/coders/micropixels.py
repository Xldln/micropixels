# The copyright in this software is being made available under the BSD
# License, included below. This software may be subject to other third party
# and contributor rights, including patent rights, and no such rights are
# granted under this license.
#
# Copyright (c) 2010-2022, ITU/ISO/IEC
# All rights reserved.
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:
#
# * Redistributions of source code must retain the above copyright notice,
# this list of conditions and the following disclaimer.
# * Redistributions in binary form must reproduce the above copyright notice,
# this list of conditions and the following disclaimer in the documentation
# and/or other materials provided with the distribution.
# * Neither the name of the ITU/ISO/IEC nor the names of its contributors may
# be used to endorse or promote products derived from this software without
# specific prior written permission.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
# AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
# IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
# ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS
# BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
# CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
# SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
# INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
# CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
# ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
# THE POSSIBILITY OF SUCH DAMAGE.

import os
import torch
from typing import List, Optional

from src.codec import get_downloader
from src.codec.common import Image, Decisions
from src.codec.common.timeslot import Timeslot

from ...codec.coders import (
    def_encoder_base_parser, def_encoder_parser_decorator,
    def_decoder_base_parser, def_decoder_parser_decorator,
)
from ...codec.scripts import CoderProcess

from .encoder import RecoEncoder
from .decoder import RecoDecoder


# ######################################################################################################################
#  MicroPixels — combined encoder + decoder
# ######################################################################################################################
class MicroPixels:
    """Combined encoder/decoder that loads all models into memory on init."""

    def __init__(
        self,
        encoder_cmd_args: Optional[List[str]] = None,
        decoder_cmd_args: Optional[List[str]] = None,
        models_dir: str = 'models',
        device: str = 'cpu',
    ):
        self.device = device

        # ── Encoder ──────────────────────────────────────────────────────
        self._enc_base_parser = def_encoder_base_parser('Reconstruction')
        self._enc_parser_decorator = def_encoder_parser_decorator(self._enc_base_parser)
        self.encoder = RecoEncoder(self._enc_base_parser, self._enc_parser_decorator)

        # Pad placeholder positional args (input_path, bin_path) before --cfg so argparse nargs='+'
        # doesn't consume them. Real paths are passed via encode_stream(params) at runtime.
        _enc_args = ["input.png", "output.bin"] + list(encoder_cmd_args or [])
        self.encoder.init_common_codec(build_model=True, cmd_args=_enc_args)
        if device == 'cpu':
            torch.set_num_threads(1)
        self.encoder.load_models(
            get_downloader(models_dir, critical_for_file_absence=True)
        )

        # ── Decoder ──────────────────────────────────────────────────────
        self._dec_base_parser = def_decoder_base_parser('Reconstruction')
        self._dec_parser_decorator = def_decoder_parser_decorator(self._dec_base_parser)
        self.decoder = RecoDecoder(self._dec_base_parser, self._dec_parser_decorator)

        self.decoder.print_coder_info()
        _dec_args = ["input.bin", "output.png"] + list(decoder_cmd_args or [])
        self.decoder.init_common_codec(build_model=True, cmd_args=_dec_args)
        if device == 'gpu':
            self.decoder.init_cuda()
        self.decoder.setup_ptflops_custom_hooks()
        self.decoder.ce.load_models_recursively(
            get_downloader(models_dir, critical_for_file_absence=True)
        )

    # ##################################################################################################################
    #  Encoder interface
    # ##################################################################################################################

    def encode_stream(self, params: dict) -> Decisions:
        """Encode an image to a bitstream.

        Parameters
        ----------
        params : dict
            Must contain at least ``input_path`` and ``bin_path``.

        Returns
        -------
        decisions : Decisions
        """
        raw_image = Image.read_file(params['input_path'])

        if self.encoder.ce.target_device == 'cpu':
            torch.set_num_threads(1)

        self.encoder.rec_image, decisions = self.encoder.ce.compress(raw_image)

        self.encoder.create_bs(params['bin_path'])
        self.encoder.init_ec_module()
        self.encoder.ce.encode(self.encoder.ec_module, decisions)
        self.encoder.close_bs()

        return decisions

    def process_encoder(
        self,
        cmd_args: Optional[List[str]] = None,
        loadNbuild_models: bool = True,
        ce = None,
        cmd_args_add: bool = False,
        overload_ce: bool = True,
    ) -> Decisions:
        """Run the full encoder pipeline (equivalent to ``process_encoder``)."""
        encoder = self.encoder
        encoder.print_coder_info()

        kwargs, params, _ = encoder.init_common_codec(
            build_model=loadNbuild_models, cmd_args=cmd_args, ce=ce,
            overload_ce=overload_ce, cmd_args_add=cmd_args_add,
        )

        if loadNbuild_models:
            timeslot_loadmodel = Timeslot()
            timeslot_loadmodel.set_bgn_time()
            encoder.load_models(
                get_downloader(
                    kwargs.get('models_dir_name', 'models'),
                    critical_for_file_absence=not kwargs.get('skip_loading_error', False),
                )
            )
            timeslot_loadmodel.set_end_time()

        encoder.set_target_bpp_idx(kwargs['bpp_idx'])

        out_profiler_dir = os.path.dirname(os.path.dirname(kwargs['bin_path']))
        encoder.set_collector_dir(out_profiler_dir)

        timeslot = Timeslot()
        timeslot.set_bgn_time()

        decisions = encoder.encode_stream(kwargs)
        encoder.ce.check_complience()
        rec_path = kwargs.get('rec_path')
        is_write_rec = rec_path is not None

        timeslot.set_end_time()
        timeslot.print_all_times()

        timeslot_hash = Timeslot()
        timeslot_hash.set_bgn_time()
        encoder.print_image_hash(encoder.rec_image)
        timeslot_hash.set_end_time()

        output_ext = ".png"
        calc_metrics = kwargs.get('calc_metrics', False)
        if calc_metrics:
            ori_fn = kwargs.get('input_path', None)
            if ori_fn is not None:
                output_ext = os.path.splitext(ori_fn)[1]

        if is_write_rec:
            timeslot_dump = Timeslot()
            timeslot_dump.set_bgn_time()
            encoder.rec_image.write_file(
                rec_path, bit_depth=kwargs.get('output_bit_depth'),
            )
            timeslot_dump.set_end_time()
            print(f'Dump to file: {timeslot_dump.to_seconds()} second')

        if calc_metrics:
            import tempfile
            ori_fn = kwargs.get('input_path', None)
            bit_fn = kwargs.get('bin_path', None)
            timeslot_dump = Timeslot()
            with tempfile.NamedTemporaryFile(suffix=output_ext) as f:
                timeslot_dump.set_bgn_time()
                encoder.compute_metrics(
                    f.name, ori_fn, bit_fn,
                    output_fn=None if rec_path is None else os.path.basename(rec_path),
                )
                timeslot_dump.set_end_time()
            print(f'Metrics calculation: {timeslot_dump.to_seconds()} second')

        if rec_path is not None:
            encoder.save_profilers_results(
                os.path.basename(rec_path),
                kwargs.get('target_bpps', [1])[0],
            )

        if loadNbuild_models:
            print(f'Loading models: {timeslot_loadmodel.to_seconds()} second')
        print(f'Hash calculation: {timeslot_hash.to_seconds()} second')

        return decisions

    # ##################################################################################################################
    #  Decoder interface
    # ##################################################################################################################

    def decode_stream(
        self, bit_fpath: str, rec_file: str = None, params: dict = None,
    ) -> Decisions:
        """Decode a bitstream to a reconstructed image.

        Parameters
        ----------
        bit_fpath : str
            Path to the input bitstream.
        rec_file : str, optional
            Path where the reconstructed image will be written.
        params : dict, optional
            Additional parameters.

        Returns
        -------
        decisions : Decisions
        """
        decoder = self.decoder

        if decoder.ce.target_device == 'cpu':
            torch.set_num_threads(1)

        basename = os.path.basename(bit_fpath)
        _, decoder.img_name, decoder.target_bpp = decoder.parse_bitstream_name(basename)

        decoder.open_bs(bit_fpath)

        decisions = decoder.ce.decode(decoder.ec_module, with_headers=False)
        decoder.ce.check_complience()
        decoder.rec_image = decoder.ce.decompress(decisions)

        decoder.close_bs()

        return decisions

    def process_decoder(
        self,
        cmd_args: Optional[List[str]] = None,
        loadNbuild_models: bool = True,
        ce = None,
        cmd_args_add: bool = False,
        overload_ce: bool = True,
    ) -> Decisions:
        """Run the full decoder pipeline (equivalent to ``process_decoder``)."""
        decoder = self.decoder
        decoder.print_coder_info()

        kwargs, params, _ = decoder.init_common_codec(
            build_model=loadNbuild_models, cmd_args=cmd_args, ce=ce,
            overload_ce=overload_ce, cmd_args_add=cmd_args_add,
        )

        if kwargs.get('device') == 'gpu':
            decoder.init_cuda()

        decoder.setup_ptflops_custom_hooks()

        bit_fpath = kwargs.get('bit_fpath')
        rec_path = kwargs.get('rec_path')
        calc_ptflops = kwargs.get('calc_ptflops')

        out_dir = os.path.dirname(os.path.dirname(bit_fpath))
        decoder.set_collector_dir(out_dir)
        img_name = os.path.splitext(os.path.basename(bit_fpath))[0]

        if loadNbuild_models:
            timeslot_loadmodel = Timeslot()
            timeslot_loadmodel.set_bgn_time()
            decoder.ce.load_models_recursively(
                get_downloader(
                    kwargs.get('models_dir_name', 'models'),
                    critical_for_file_absence=not kwargs.get('skip_loading_error', False),
                )
            )
            timeslot_loadmodel.set_end_time()

        if calc_ptflops:
            if overload_ce:
                decoder.ptflops_init()
            else:
                decoder.ptflops_reset()

        timeslot = Timeslot()
        timeslot.set_bgn_time()

        decoder.decode_stream(bit_fpath, None, kwargs)

        if kwargs.get('device') == 'gpu':
            torch.cuda.synchronize()
        timeslot.set_end_time()
        total_seconds = timeslot.to_seconds()
        timeslot.print_gap_time()

        timeslot_hash = Timeslot()
        timeslot_hash.set_bgn_time()
        decoder.print_image_hash(decoder.rec_image)
        timeslot_hash.set_end_time()

        timeslot_dump = Timeslot()
        timeslot_dump.set_bgn_time()
        decoder.rec_image.write_file(rec_path, bit_depth=kwargs.get('output_bit_depth'))
        timeslot_dump.set_end_time()

        calc_metrics = kwargs.get('calc_metrics', False)
        if calc_metrics:
            import tempfile
            ori_file = kwargs.get('ori_file', '')
            ori_ext = os.path.splitext(ori_file)[1]
            fname_suffix = ori_ext
            if ori_ext.endswith(".yuv"):
                s = decoder.rec_image.shape
                fname_suffix = (
                    f"{s[-1]}x{s[-2]}_{decoder.rec_image.bit_depth}"
                    f"bit_YUV{decoder.rec_image.format}{fname_suffix}"
                )
            with tempfile.NamedTemporaryFile(suffix=fname_suffix) as f:
                decoder.compute_metrics(
                    f.name, ori_file, bit_fpath,
                    output_fn=os.path.basename(rec_path),
                )

        if calc_ptflops:
            rec_shape = (decoder.rec_image.shape[-1], decoder.rec_image.shape[-2])
            decoder.ptflops_term(rec_shape, rec_path, kwargs, total_seconds)

        if loadNbuild_models:
            print(f'Loading models: {timeslot_loadmodel.to_seconds()} second')
        if timeslot_dump is not None:
            print(f'Dump to file: {timeslot_dump.to_seconds()} second')
        print(f'Hash calculation: {timeslot_hash.to_seconds()} second')
        decoder.save_profilers_results(img_name, None)

        return 0

    # ── Convenience properties ──────────────────────────────────────────

    @property
    def rec_image(self) -> Image:
        return getattr(self.encoder, 'rec_image',
                       getattr(self.decoder, 'rec_image', None))

    @rec_image.setter
    def rec_image(self, value: Image):
        self.encoder.rec_image = value
        self.decoder.rec_image = value

    # ##################################################################################################################
    #  Process wrapper classes
    # ##################################################################################################################

    class EncoderProcess(CoderProcess):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            base_parser = def_encoder_base_parser('Reconstruction')
            self.enc_inst = RecoEncoder(
                base_parser, def_encoder_parser_decorator(base_parser),
            )

        def process(self, cmd_args: List[str]) -> Decisions:
            self.ce.is_encoder = True
            from .encoder import process_encoder as _pe
            ans = _pe(
                self.enc_inst, cmd_args,
                not self.is_model_loaded(), self.ce,
                self.is_first_time(), overload_ce=self.is_first_time(),
            )
            self.set_model_loaded(True)
            self.set_first_fime(False)
            return ans

    class DecoderProcess(CoderProcess):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            base_parser = def_decoder_base_parser('Reconstruction')
            parser_decorator = def_decoder_parser_decorator(base_parser)
            self.dec_inst = RecoDecoder(base_parser, parser_decorator)

        def process(self, cmd_args: List[str]) -> Decisions:
            self.ce.is_encoder = False
            from .decoder import process_decoder as _pd
            ans = _pd(
                self.dec_inst, cmd_args,
                not self.is_model_loaded(), self.ce,
                cmd_args_add=not self.is_args_stored(),
                overload_ce=self.is_first_time(),
            )
            self.set_model_loaded(True)
            self.set_first_fime(False)
            self.set_args_stored(True)
            return ans
